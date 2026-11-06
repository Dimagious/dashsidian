/* Plays the films on the main page and the guides; both load this file. */
(function () {
  "use strict";
  // A film plays only while on screen. With reduced motion it stays on its
  // poster, and the controls leave playing it to the reader.
  var films = document.querySelectorAll("video[data-film]");
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
    films.forEach(function (v) { v.controls = true; });
  } else {
    var filmView = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          // A browser may refuse to play (data saver): the poster stays, and
          // the controls let the reader start it.
          e.target.play().catch(function () { e.target.controls = true; });
        } else {
          e.target.pause();
        }
      });
    }, { threshold: 0.4 });
    films.forEach(function (v) { filmView.observe(v); });
  }
})();
