# SPDX-License-Identifier: AGPL-3.0-or-later
"""Compact first-page YouTube search; preserve SearXNG parsing and pagination."""

from json import dumps
from urllib.parse import parse_qs, parse_qsl, unquote, urlencode, urlsplit, urlunsplit

from searx.engines import youtube_noapi as _youtube

about = dict(_youtube.about)
categories = list(_youtube.categories)
paging = _youtube.paging
enable_http3 = _youtube.enable_http3
language_support = _youtube.language_support
time_range_support = _youtube.time_range_support

# Matches the WEB client already used by upstream's continuation requests.
web_client_version = "2.20210310.12.01"
_FIELDS = (
    "contents/twoColumnSearchResultsRenderer/primaryContents/sectionListRenderer/"
    "contents(itemSectionRenderer/contents/videoRenderer(videoId,title,"
    "descriptionSnippet,ownerText,lengthText),continuationItemRenderer)"
)
_NEXT_FIELDS = (
    "onResponseReceivedCommands/appendContinuationItemsAction/continuationItems("
    "itemSectionRenderer/contents/videoRenderer(videoId,title,descriptionSnippet,"
    "ownerText,lengthText,thumbnail),continuationItemRenderer)"
)


def request(query, params):
    _youtube.request(query, params)
    if params.get("engine_data", {}).get("next_page_token"):
        url = urlsplit(params["url"])
        query_params = dict(parse_qsl(url.query))
        query_params.update(prettyPrint="false", fields=_NEXT_FIELDS)
        params["url"] = urlunsplit(url._replace(query=urlencode(query_params)))
        return params

    original_query = parse_qs(urlsplit(params["url"]).query)
    payload = {
        "context": {"client": {"clientName": "WEB", "clientVersion": web_client_version}},
        "query": query,
    }
    if "sp" in original_query:
        payload["params"] = unquote(original_query["sp"][0])
    params["url"] = "https://www.youtube.com/youtubei/v1/search?" + urlencode(
        {"prettyPrint": "false", "fields": _FIELDS}
    )
    params["method"] = "POST"
    params["headers"]["Content-Type"] = "application/json"
    params["data"] = dumps(payload)
    return params


def response(resp):
    if resp.search_params.get("engine_data"):
        return _youtube.response(resp)

    payload = resp.json()
    if not isinstance(payload, dict) or payload.get("error"):
        raise ValueError("YouTube returned an unexpected search response")
    sections = (
        payload.get("contents", {})
        .get("twoColumnSearchResultsRenderer", {})
        .get("primaryContents", {})
        .get("sectionListRenderer", {})
        .get("contents")
    )
    if not isinstance(sections, list):
        raise ValueError("YouTube search results are missing their expected sections")

    # The upstream first-page parser extracts this JSON from an HTML script.
    # Supply the unchanged payload with that framing rather than duplicate its
    # renderer and continuation parsing. Escape closing tags inside video text.
    framed = "ytInitialData = " + dumps(payload).replace("</", "<\\/") + ";</script>"
    return _youtube.parse_first_page_response(framed)
