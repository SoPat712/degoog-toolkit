(function () {
  "use strict";

  document.addEventListener(
    "error",
    (event) => {
      const image = event.target?.closest?.(".music-cover img");
      if (image) image.hidden = true;
    },
    true,
  );
})();
