# SPDX-License-Identifier: AGPL-3.0-or-later
"""Parse Brave's literal Svelte data and reuse SearXNG's video result mapping.

The request/cookie contract follows searx.engines.brave. Only select this
separate module for brave.videos; it never changes the official module globals.
Provider JavaScript is parsed as data and is never executed.
"""

import json
import re
from types import SimpleNamespace
from urllib.parse import urlencode

from searx import locales
from searx.engines import brave as _brave
from searx.enginelib.traits import EngineTraitsMap
from searx.exceptions import SearxEngineResponseException
from searx.result_types import EngineResults
from searx.utils import js_obj_str_to_python

about = dict(_brave.about)
categories = ["videos"]
enable_http3 = _brave.enable_http3
paging = False
safesearch = True
time_range_support = False
brave_category = "videos"
brave_spellcheck = False
_IDENTIFIER = re.compile(r"[A-Za-z_$][\w$]*")


def setup(engine_settings):
    global traits, language_support
    # The custom module name has no bundled traits entry. Copy Brave's actual
    # traits and apply the operator's language/region restrictions normally.
    source = EngineTraitsMap.from_data()["brave"]
    target = SimpleNamespace(
        name=engine_settings["name"],
        language=engine_settings.get("language"),
        region=engine_settings.get("region"),
        language_support=bool(source.languages or source.regions),
    )
    source.set_traits(target)
    traits = target.traits
    language_support = target.language_support
    return True


def request(query, params):
    args = {"q": query, "source": "web"}
    if brave_spellcheck:
        args["spellcheck"] = "1"
    params["url"] = "https://search.brave.com/videos?" + urlencode(args)
    params["headers"]["Accept-Encoding"] = "gzip, deflate"
    params["cookies"].update(
        safesearch=_brave.safesearch_map.get(params["safesearch"], "off"),
        useLocation="0",
        summarizer="0",
        country=traits.get_region(params["searxng_locale"], "all").split("-")[-1].lower(),
        ui_lang=locales.get_engine_locale(params["searxng_locale"], traits.custom["ui_lang"], "en-us"),
    )


def _quoted_end(text, start):
    quote = text[start]
    pos = start + 1
    while pos < len(text):
        if text[pos] == "\\":
            pos += 2
        elif text[pos] == quote:
            if quote == "`" and "${" in text[start:pos]:
                raise ValueError("Unsupported template expression")
            return pos + 1
        else:
            pos += 1
    raise ValueError("Unterminated string")


def _balanced_end(text, start):
    closing = {"[": "]", "{": "}", "(": ")"}
    stack = [closing[text[start]]]
    pos = start + 1
    while pos < len(text):
        char = text[pos]
        if char in "\"'`":
            pos = _quoted_end(text, pos)
            continue
        if char in closing:
            stack.append(closing[char])
        elif char in "]})":
            if char != stack.pop():
                raise ValueError("Mismatched data delimiters")
            if not stack:
                return pos + 1
        pos += 1
    raise ValueError("Unterminated data")


def _items(text):
    parts = []
    start = pos = 0
    while pos < len(text):
        char = text[pos]
        if char in "\"'`":
            pos = _quoted_end(text, pos)
            continue
        if char in "[{(":
            pos = _balanced_end(text, pos)
            continue
        if char == ",":
            parts.append(text[start:pos].strip())
            start = pos + 1
        pos += 1
    if text[start:].strip():
        parts.append(text[start:].strip())
    return parts


def _bind_literals(text, bindings):
    """Replace only variable values, preserving quoted strings and object keys."""
    output = []
    pos = 0
    while pos < len(text):
        if text[pos] in "\"'`":
            end = _quoted_end(text, pos)
            output.append(text[pos:end])
        elif (text[pos].isascii() and text[pos].isalpha()) or text[pos] in "_$":
            match = _IDENTIFIER.match(text, pos)
            name = match.group()
            end = pos + len(name)
            next_pos = end
            while next_pos < len(text) and text[next_pos].isspace():
                next_pos += 1
            is_key = text[next_pos:next_pos + 1] == ":"
            output.append(json.dumps(bindings[name], ensure_ascii=True) if name in bindings and not is_key else name)
        else:
            end = pos + 1
            output.append(text[pos:end])
        pos = end
    return "".join(output)


def _entry(text):
    if text.startswith("{"):
        return js_obj_str_to_python(text)
    prefix = re.match(r"\(\s*function\s*\(([\w$,\s]*)\)\s*\{\s*return\s*", text)
    if not prefix or text[prefix.end():prefix.end() + 1] != "{":
        raise ValueError("Expected a literal data wrapper")
    names = [part.strip() for part in prefix[1].split(",") if part.strip()]
    if len(names) != len(set(names)) or any(not re.fullmatch(r"[A-Za-z_$][\w$]*", name) for name in names):
        raise ValueError("Invalid wrapper parameters")
    body_end = _balanced_end(text, prefix.end())
    call = re.match(r"\s*;?\s*}\s*\(", text[body_end:])
    if not call:
        raise ValueError("Missing literal wrapper arguments")
    args_start = body_end + call.end() - 1
    args_end = _balanced_end(text, args_start)
    if text[args_end:].strip() != ")":
        raise ValueError("Unexpected wrapper expression")
    args = js_obj_str_to_python("[" + text[args_start + 1:args_end - 1] + "]")
    if len(args) != len(names):
        raise ValueError("Wrapper argument count mismatch")
    return js_obj_str_to_python(_bind_literals(text[prefix.end():body_end], dict(zip(names, args))))


def response(resp):
    try:
        anchor = resp.text.index("kit.start")
        marker = re.search(r"\bdata\s*:\s*\[", resp.text[anchor:])
        if not marker:
            raise ValueError("Missing hydration data")
        start = anchor + marker.end() - 1
        end = _balanced_end(resp.text, start)
        entries = _items(resp.text[start + 1:end - 1])
        if len(entries) < 2:
            raise ValueError("Missing result data")
        # Configuration data in entry zero is deliberately not interpreted.
        data = _entry(entries[1])["data"]
        results = EngineResults()
        if data.get("noResults") is True:
            return results
        payload = data["body"]["response"]
        if payload.get("type") != "videos" or not isinstance(payload.get("results"), list):
            raise ValueError("Unexpected video result shape")
        for result in payload["results"]:
            results.add(_brave.parse_video_result(result))
        return results
    except (ValueError, KeyError, IndexError, TypeError, AttributeError) as error:
        raise SearxEngineResponseException("Brave returned unexpected video data") from error
