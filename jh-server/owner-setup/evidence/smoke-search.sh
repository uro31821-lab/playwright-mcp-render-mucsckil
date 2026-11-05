#!/usr/bin/env bash
# One intentionally BILLABLE real Search API smoke test. Does not print the key
# or page contents. Run only on your own trusted machine/Render shell with
# PERPLEXITY_API_KEY already set in the environment.
set -euo pipefail

if [[ -z "${PERPLEXITY_API_KEY:-}" ]]; then
  printf 'PERPLEXITY_API_KEY_NOT_AVAILABLE\n'
  printf 'Create an API key at https://console.perplexity.ai and set it privately in your environment. Do not paste it into ChatGPT.\n'
  exit 2
fi
command -v curl >/dev/null || { printf 'CURL_REQUIRED\n'; exit 2; }
command -v jq >/dev/null || { printf 'JQ_REQUIRED\n'; exit 2; }

payload="$(jq -n --arg query 'official Perplexity Search API documentation' '{query:$query,max_results:1}')"
response_file="$(mktemp)"
trap 'rm -f "$response_file"' EXIT

# Keep curl's exit status: never pipe curl directly into jq.
# --fail-with-body returns a non-zero status on 4xx/5xx; the body remains
# private in an auto-deleted file. Only the HTTP status is printed.
if http_status="$(curl --fail-with-body --show-error --silent \
  --max-time 25 -o "$response_file" -w '%{http_code}' \
  --request POST 'https://api.perplexity.ai/search' \
  --header "Authorization: Bearer ${PERPLEXITY_API_KEY}" \
  --header 'Content-Type: application/json' \
  --data "$payload")"; then
  printf 'HTTP_STATUS=%s\n' "$http_status"
  # Print the response SHAPE only, never the snippet, title, URL, or token.
  jq -er '{
    results_is_array:(.results|type=="array"),
    result_count:(.results|length),
    first_result_shape:(if (.results|length)>0 then {
      title_type:(.results[0].title|type),
      url_type:(.results[0].url|type),
      snippet_type:(.results[0].snippet|type)
    } else null end)
  }' "$response_file"
else
  code=$?
  printf 'HTTP_STATUS=%s\n' "${http_status:-unknown}"
  exit "$code"
fi
