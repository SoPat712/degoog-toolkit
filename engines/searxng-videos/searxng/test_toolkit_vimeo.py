"""Offline contract tests; no SearXNG installation or external calls required."""

import importlib.util
from pathlib import Path
import sys
import types
import unittest
from urllib.parse import parse_qs, urlencode, urlsplit


class VimeoProjectionContract(unittest.TestCase):
    def setUp(self):
        self.upstream = types.ModuleType("searx.engines.vimeo")
        self.upstream.about = {"website": "https://vimeo.com/"}
        self.upstream.categories = ["videos"]
        self.upstream.paging = True
        self.calls = []
        self.upstream.setup = lambda settings: self.calls.append(("setup", settings))

        def request(query, params):
            self.calls.append(("request", query))
            params["url"] = "https://api.vimeo.com/search?" + urlencode(
                {"filter_type": "clip", "query": query, "page": params["pageno"], "per_page": 20}
            )
            params["headers"]["authorization"] = "jwt test-only-token"

        self.upstream.request = request
        self.upstream.response = lambda response: response
        searx = types.ModuleType("searx")
        engines = types.ModuleType("searx.engines")
        engines.vimeo = self.upstream
        self.saved = {name: sys.modules.get(name) for name in ("searx", "searx.engines", "searx.engines.vimeo")}
        sys.modules.update({"searx": searx, "searx.engines": engines, "searx.engines.vimeo": self.upstream})
        spec = importlib.util.spec_from_file_location("toolkit_vimeo", Path(__file__).with_name("toolkit_vimeo.py"))
        self.adapter = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.adapter)

    def tearDown(self):
        for name, module in self.saved.items():
            if module is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = module

    def test_preserves_query_page_count_and_upstream_auth(self):
        query = "wood joints & hand planes / 日本語"
        params = {"pageno": 2, "headers": {"Accept": "upstream-media-type"}}
        self.assertTrue(self.adapter.setup({"name": "vimeo"}))
        self.adapter.request(query, params)
        url = urlsplit(params["url"])
        args = parse_qs(url.query)
        self.assertEqual((url.scheme, url.netloc, url.path), ("https", "api.vimeo.com", "/videos"))
        self.assertEqual(args["query"], [query])
        self.assertEqual(args["page"], ["2"])
        self.assertEqual(args["per_page"], ["20"])
        self.assertNotIn("filter_type", args)
        self.assertIn("name", args["fields"][0].split(","))
        self.assertNotIn("data.clip.name", args["fields"][0].split(","))
        self.assertEqual(params["headers"], {"Accept": "upstream-media-type", "authorization": "jwt test-only-token"})
        self.assertEqual(self.calls, [("setup", {"name": "vimeo"}), ("request", query)])

    def test_returns_upstream_results_and_does_not_swallow_errors(self):
        videos = [{"name": "One", "link": "https://vimeo.com/1"}, {"name": "Two", "link": "https://vimeo.com/2"}]
        self.upstream.response = lambda response: response.json()["data"]
        response = types.SimpleNamespace(json=lambda: {"data": videos})
        self.assertEqual(self.adapter.response(response), [{"clip": video} for video in videos])
        self.assertEqual(self.adapter.response(types.SimpleNamespace(json=lambda: {"data": []})), [])
        with self.assertRaisesRegex(ValueError, "unexpected video response"):
            self.adapter.response(types.SimpleNamespace(json=lambda: {"error": "unavailable"}))

        def fail(_response):
            raise ValueError("provider changed its response")

        self.upstream.response = fail
        with self.assertRaisesRegex(ValueError, "provider changed"):
            self.adapter.response({})

    def test_projected_search_endpoint_remains_an_explicit_option(self):
        self.adapter.api_endpoint = "search"
        params = {"pageno": 1, "headers": {}}
        self.adapter.request("pottery", params)
        url = urlsplit(params["url"])
        args = parse_qs(url.query)
        self.assertEqual(url.path, "/search")
        self.assertEqual(args["filter_type"], ["clip"])
        self.assertIn("clip.name", args["fields"][0].split(","))
        original = object()
        self.assertIs(self.adapter.response(original), original)


if __name__ == "__main__":
    unittest.main()
