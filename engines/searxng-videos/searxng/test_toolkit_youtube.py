"""Offline request and parser-delegation checks for the compact YouTube adapter."""

import importlib.util
import json
from pathlib import Path
import sys
import types
import unittest
from urllib.parse import parse_qs, urlsplit


class YouTubeCompactContract(unittest.TestCase):
    def setUp(self):
        upstream = types.ModuleType("searx.engines.youtube_noapi")
        for key, value in {"about": {}, "categories": ["videos", "music"], "paging": True,
                           "enable_http3": True, "language_support": False, "time_range_support": True}.items():
            setattr(upstream, key, value)

        def request(query, params):
            params["cookies"]["CONSENT"] = "YES+"
            if params.get("engine_data", {}).get("next_page_token"):
                params.update(url="https://www.youtube.com/continuation", method="POST", data="upstream body")
            else:
                params["url"] = "https://www.youtube.com/results?search_query=test&sp=EgIIAg%253D%253D"

        upstream.request = request
        upstream.response = lambda response: response
        upstream.parse_first_page_response = lambda framed: json.loads(framed[len("ytInitialData = "):-len(";</script>")])
        self.upstream = upstream
        searx = types.ModuleType("searx")
        engines = types.ModuleType("searx.engines")
        engines.youtube_noapi = upstream
        self.saved = {key: sys.modules.get(key) for key in ("searx", "searx.engines", "searx.engines.youtube_noapi")}
        sys.modules.update({"searx": searx, "searx.engines": engines, "searx.engines.youtube_noapi": upstream})
        spec = importlib.util.spec_from_file_location("toolkit_youtube", Path(__file__).with_name("toolkit_youtube.py"))
        self.adapter = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.adapter)

    def tearDown(self):
        for key, value in self.saved.items():
            if value is None:
                sys.modules.pop(key, None)
            else:
                sys.modules[key] = value

    def test_query_filter_and_continuation_are_preserved(self):
        params = {"pageno": 1, "headers": {}, "cookies": {}, "engine_data": {}}
        self.adapter.request("violin & bow / 日本語", params)
        url = urlsplit(params["url"])
        self.assertEqual((url.netloc, url.path), ("www.youtube.com", "/youtubei/v1/search"))
        self.assertIn("continuationItemRenderer", parse_qs(url.query)["fields"][0])
        payload = json.loads(params["data"])
        self.assertEqual(payload["query"], "violin & bow / 日本語")
        self.assertEqual(payload["params"], "EgIIAg==")
        self.assertEqual(params["cookies"], {"CONSENT": "YES+"})
        self.assertEqual(params["headers"]["Content-Type"], "application/json")
        params["engine_data"] = {"next_page_token": "real-provider-token"}
        self.adapter.request("next page", params)
        continued = urlsplit(params["url"])
        self.assertEqual(continued.path, "/continuation")
        self.assertIn("thumbnail", parse_qs(continued.query)["fields"][0])
        self.assertEqual(params["data"], "upstream body")

    def test_passes_unchanged_json_to_upstream_parser_and_preserves_empty_results(self):
        sections = [{"itemSectionRenderer": {"contents": [{"videoRenderer": {"title": "Literal </script> text"}}]}},
                    {"continuationItemRenderer": {"token": "real-token"}}]
        payload = {"contents": {"twoColumnSearchResultsRenderer": {"primaryContents": {"sectionListRenderer": {"contents": sections}}}}}
        response = types.SimpleNamespace(search_params={}, json=lambda: payload)
        self.assertEqual(self.adapter.response(response), payload)
        payload["contents"]["twoColumnSearchResultsRenderer"]["primaryContents"]["sectionListRenderer"]["contents"] = []
        self.assertEqual(self.adapter.response(response), payload)
        continued = types.SimpleNamespace(search_params={"engine_data": {"next_page_token": "token"}})
        self.assertIs(self.adapter.response(continued), continued)

    def test_malformed_and_provider_error_responses_are_not_empty_successes(self):
        for payload in ({"error": {"message": "busy"}}, {"contents": {}}, []):
            with self.assertRaises(ValueError):
                self.adapter.response(types.SimpleNamespace(search_params={}, json=lambda: payload))


if __name__ == "__main__":
    unittest.main()
