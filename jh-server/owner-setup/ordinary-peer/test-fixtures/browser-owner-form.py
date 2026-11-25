"""Run with python + playwright and an installed Chromium. All traffic stays local."""
import argparse
from contextlib import suppress
import json
from pathlib import Path
import subprocess
import time
from urllib.request import urlopen
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument("--chromium", help="Path to a Chromium executable")
args = parser.parse_args()
fixture = Path(__file__).with_name("browser-owner-fixture.mjs")
server = subprocess.Popen(["node", str(fixture)], stdout=subprocess.PIPE, text=True)
try:
    service = json.loads(server.stdout.readline())
    origin, callback = service["origin"], service["returnUrl"]
    assert origin.startswith("http://127.0.0.1:")
    # Replace the Google script locally. The actual form, callback, browser
    # origin/referrer generation and cookie handling come from the production page.
    synthetic_google = """
    function mount(){
      const el=document.createElement('button');
      el.textContent='Synthetic test account';
      el.onclick=()=>window.jhVerify({credential:document.querySelector('#g_id_onload').dataset.nonce});
      document.querySelector('.g_id_signin').appendChild(el);
    }
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
    """
    def route_local(route):
        address = route.request.url
        if address == "https://accounts.google.com/gsi/client":
            route.fulfill(content_type="application/javascript", body=synthetic_google)
        elif urlsplit(address).netloc in {urlsplit(origin).netloc, urlsplit(callback).netloc}:
            route.continue_()
        else:
            route.abort()
    with sync_playwright() as p:
        with p.chromium.launch(executable_path=args.chromium) as browser:
            results = {}
            for kind in ("previous", "candidate"):
                context = browser.new_context()
                context.route("**/*", route_local)
                page = context.new_page()
                page.goto(origin + "/" + kind + "?state=synthetic&scope=local")
                with page.expect_response(lambda r: r.request.method == "POST") as sent:
                    page.get_by_role("button", name="Synthetic test account").click()
                response = sent.value
                if kind == "previous":
                    assert response.status == 403 and "ORIGIN_NULL" in response.text()
                    results[kind] = {"status": response.status, "reason": "ORIGIN_NULL"}
                else:
                    assert response.status == 200
                    facts = response.json()
                    assert facts == dict(originMatched=True, cookiePresent=True, referrerWasOriginOnly=True)
                    results[kind] = {"status": response.status, **facts}
                context.close()
            def counts():
                with urlopen(origin + "/stats", timeout=2) as response:
                    return json.load(response)
            for kind in ("self-only", "redirect"):
                before = counts()
                context = browser.new_context()
                context.route("**/*", route_local)
                page = context.new_page()
                page.goto(origin + "/" + kind)
                button = page.get_by_role("button", name="Synthetic test account")
                button.click(no_wait_after=True)
                deadline = time.monotonic() + 4
                while counts()["approved"] == before["approved"] and time.monotonic() < deadline:
                    page.wait_for_timeout(50)
                assert counts()["approved"] == before["approved"] + 1
                if kind == "redirect":
                    page.wait_for_url(callback + "?code=synthetic", timeout=3500)
                    assert counts()["received"] == before["received"] + 1
                else:
                    page.wait_for_timeout(750)
                    assert counts()["received"] == before["received"]
                    assert page.url != callback + "?code=synthetic"
                results[kind] = {"serverIssuedRedirect": True, "callbackReceived": kind == "redirect"}
                context.close()
            print(json.dumps({"chromium": browser.version, "googleNetwork": False, **results}))
finally:
    server.terminate()
    with suppress(ProcessLookupError):
        server.wait(timeout=5)
