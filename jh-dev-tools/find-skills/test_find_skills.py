import unittest
from find_skills import normalize, query_url

class SearchTests(unittest.TestCase):
    def test_url(self):
        self.assertEqual(query_url("Android Gradle", "android"), "https://skills.sh/api/search?q=Android+Gradle&owner=android")
    def test_private_query_blocked(self):
        for value in ("token abc", "patient data", "https://private.example", "abc\nsecret"):
            with self.assertRaises(ValueError):
                query_url(value)
    def test_candidate_is_untrusted(self):
        row={"source":"android/skills","id":"android/skills/testing-setup","installs":2900}
        out=normalize({"skills":[row,row]})
        self.assertEqual(len(out),1)
        self.assertEqual(out[0]["cost"],"unverified")
        self.assertFalse(out[0]["installation_allowed"])
        self.assertTrue(out[0]["review_required"])
    def test_invalid_source(self):
        self.assertEqual(normalize({"skills":[{"source":"https://evil.test","id":"android/skills/x"},{"source":"a/b","id":"a/b/../x"}]}),[])
    def test_bad_response(self):
        with self.assertRaises(ValueError):
            normalize({"error":"network"})

if __name__ == "__main__":
    unittest.main()
