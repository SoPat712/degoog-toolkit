# Literally Google

A theme that pushes degoog toward modern Google Search while keeping the layout tighter and more self-host-friendly.

Adapted from [TheAnnoying's LiterallyGoogle](https://github.com/TheAnnoying/theannoying-degoog-extensions/tree/main/themes/LiterallyGoogle)

See [design.md](./design.md) for the full color, radius, layout, and component reference (light and dark mode).

Image searches use native degoog columns with deferred offscreen rendering and
asynchronous image decoding. Preview controls appear without width animations;
a loaded thumbnail remains visible while the original downloads. Failed
thumbnails keep their result card and source link with an explicit label.

Results follow Google's layout: four tabs plus a More menu, a site line with a
breadcrumb, and an About this result panel (⋮) that also holds degoog's
block, replace and score actions. On Images, one Sources pill lists the
engines that answered, failed (with Retry) or found nothing, and filters the
grid.
