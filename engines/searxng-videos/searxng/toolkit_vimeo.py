# SPDX-License-Identifier: AGPL-3.0-or-later
"""Use Vimeo's typed video API with SearXNG authentication and parsing.

Install as a separate SearXNG engine module; never replace vimeo.py. Keep the
engine's configured name (vimeo) so preferences and failures remain visible.
"""

from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from searx.engines import vimeo as _vimeo

about = dict(_vimeo.about)
categories = list(_vimeo.categories)
paging = _vimeo.paging
api_endpoint = "videos"

# Vimeo's heterogeneous /search response nests videos under "clip". Prefixing
# these with "data." silently produces an empty search, not a smaller payload.
_FIELDS = ",".join(
    (
        "clip.link",
        "clip.name",
        "clip.user.name",
        "clip.pictures.base_link",
        "clip.duration",
        "clip.created_time",
    )
)


def setup(engine_settings):
    if api_endpoint not in ("videos", "search"):
        raise ValueError("api_endpoint must be videos or search")
    _vimeo.setup(engine_settings)
    return True


def request(query, params):
    _vimeo.request(query, params)
    url = urlsplit(params["url"])
    query_params = [(key, value) for key, value in parse_qsl(url.query, keep_blank_values=True) if key != "fields"]
    fields = _FIELDS
    if api_endpoint == "videos":
        query_params = [(key, value) for key, value in query_params if key != "filter_type"]
        fields = ",".join(field.removeprefix("clip.") for field in _FIELDS.split(","))
    query_params.append(("fields", fields))
    params["url"] = urlunsplit(url._replace(path=f"/{api_endpoint}", query=urlencode(query_params)))


class _VideoEnvelope:
    """Adapt /videos objects to the clip envelopes the upstream parser expects."""

    def __init__(self, response):
        self._response = response

    def __getattr__(self, name):
        return getattr(self._response, name)

    def json(self):
        payload = self._response.json()
        if not isinstance(payload, dict) or not isinstance(payload.get("data"), list) or payload.get("error"):
            raise ValueError("Vimeo returned an unexpected video response")
        return {**payload, "data": [{"clip": video} for video in payload["data"]]}


def response(resp):
    # Reuse upstream parsing, including its failures if the API shape changes.
    return _vimeo.response(_VideoEnvelope(resp) if api_endpoint == "videos" else resp)
