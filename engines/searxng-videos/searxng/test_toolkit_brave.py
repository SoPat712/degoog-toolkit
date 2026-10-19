"""Offline Brave hydration contracts; never execute provider JavaScript."""

import importlib.util
import json
from pathlib import Path
import sys
import types
import unittest
from urllib.parse import parse_qs, urlsplit


class BraveHydrationContract(unittest.TestCase):
    def setUp(self):
        brave = types.ModuleType("searx.engines.brave")
        brave.about = {"website": "https://search.brave.com/"}
        brave.enable_http3 = True
        brave.safesearch_map = {0: "off", 1: "moderate", 2: "strict"}
        brave.brave_category = "search"
        self.parsed = []
        brave.parse_video_result = lambda result: self.parsed.append(result) or result
        engines = types.ModuleType("searx.engines")
        engines.brave = brave
        searx = types.ModuleType("searx")
        searx.locales = types.SimpleNamespace(get_engine_locale=lambda locale, mapping, fallback: mapping.get(locale, fallback))
        traits_module = types.ModuleType("searx.enginelib.traits")
        source = types.SimpleNamespace(languages={"en": "en", "de": "de"}, regions={"de-DE": "de"})

        def set_traits(target):
            target.traits = types.SimpleNamespace(
                get_region=lambda locale, fallback: "de-DE" if locale == "de-DE" else fallback,
                custom={"ui_lang": {"de-DE": "de-de"}},
            )
        source.set_traits = set_traits
        traits_module.EngineTraitsMap = types.SimpleNamespace(from_data=lambda: {"brave": source})
        exceptions = types.ModuleType("searx.exceptions")
        self.error = type("SearxEngineResponseException", (Exception,), {})
        exceptions.SearxEngineResponseException = self.error
        result_types = types.ModuleType("searx.result_types")

        class Results(list):
            def add(self, value):
                self.append(value)

        result_types.EngineResults = Results
        utils = types.ModuleType("searx.utils")
        # Fixtures use quoted keys, leaving only the wrapper's real aliases to
        # resolve. A separate live check uses SearXNG's actual JS literal parser.
        utils.js_obj_str_to_python = json.loads
        modules = {"searx": searx, "searx.engines": engines, "searx.engines.brave": brave,
                   "searx.enginelib.traits": traits_module, "searx.exceptions": exceptions,
                   "searx.result_types": result_types, "searx.utils": utils}
        self.saved = {key: sys.modules.get(key) for key in modules}
        sys.modules.update(modules)
        spec = importlib.util.spec_from_file_location("toolkit_brave", Path(__file__).with_name("toolkit_brave.py"))
        self.adapter = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.adapter)
        self.brave = brave
        self.adapter.setup({"name": "brave.videos"})

    def tearDown(self):
        for key, value in self.saved.items():
            if value is None:
                sys.modules.pop(key, None)
            else:
                sys.modules[key] = value

    def response(self, entry):
        # Entry zero must not be interpreted or executed, even if it contains
        # arbitrary provider code. Only the second data entry supplies results.
        text = '<script>kit.start(app, element, {data: [untrustedFunction(), ' + entry + '], form: null});</script>'
        return self.adapter.response(types.SimpleNamespace(text=text))

    def test_function_wrapped_result_binds_values_without_changing_strings_or_keys(self):
        entry = ('(function(a,b,c){return {"data":{"body":{"response":{"type":"videos",'
                 '"results":[{"title":a,"url":b,"description":"a, ] } \\"quoted\\"",'
                 '"a":"a","video":{"duration":c,"views":"100"},'
                 '"age":"2026-10-01","thumbnail":{"src":"https://example.test/thumb.jpg"}}]}}}}'
                 '}("Actual title","https://example.test/video",42))')
        results = self.response(entry)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["title"], "Actual title")
        self.assertEqual(results[0]["a"], "a")
        self.assertEqual(results[0]["description"], 'a, ] } "quoted"')
        self.assertEqual(results[0]["video"], {"duration": 42, "views": "100"})
        self.assertEqual(self.parsed, results)
        self.assertEqual(self.brave.brave_category, "search")

    def test_legacy_plain_object_and_explicit_empty_results_remain_valid(self):
        value = {"data": {"body": {"response": {"type": "videos", "results": []}}}}
        self.assertEqual(self.response(json.dumps(value)), [])
        self.assertEqual(self.response('{"data":{"noResults":true}}'), [])

    def test_malformed_challenge_wrong_type_and_expressions_are_failures(self):
        bad_entries = [
            '{"data":{"body":{"response":{"type":"images","results":[]}}}}',
            '{"data":{"body":{"response":{"type":"videos","results":{}}}}}',
            '(function(a){return {"data":a}}(dangerousCode()))',
            '(function(a,b){return {"data":a}}(1))',
            '(function(a){return {"data":a}}(1));otherCode()',
            '(function(a){return {"data":a}}(1)',
            '(function(a){return {"data":`value ${dangerousCode()}`}}(1))',
        ]
        for entry in bad_entries:
            with self.subTest(entry=entry), self.assertRaises(self.error):
                self.response(entry)
        with self.assertRaises(self.error):
            self.adapter.response(types.SimpleNamespace(text='<title>Just a moment...</title>'))
        self.assertEqual(self.parsed, [])

    def test_request_preserves_query_region_safesearch_and_explicit_spellcheck(self):
        params = {"pageno": 2, "headers": {}, "cookies": {}, "safesearch": 2, "searxng_locale": "de-DE"}
        self.adapter.request("wood joints & 日本語", params)
        url = urlsplit(params["url"])
        self.assertEqual((url.netloc, url.path), ("search.brave.com", "/videos"))
        self.assertEqual(parse_qs(url.query), {"q": ["wood joints & 日本語"], "source": ["web"]})
        self.assertEqual(params["cookies"], {"safesearch": "strict", "useLocation": "0", "summarizer": "0", "country": "de", "ui_lang": "de-de"})
        self.adapter.brave_spellcheck = True
        self.adapter.request("another", params)
        self.assertEqual(parse_qs(urlsplit(params["url"]).query)["spellcheck"], ["1"])
        self.assertEqual(self.brave.brave_category, "search")
        self.assertFalse(self.adapter.paging)
        self.assertTrue(self.adapter.enable_http3)


if __name__ == "__main__":
    unittest.main()
