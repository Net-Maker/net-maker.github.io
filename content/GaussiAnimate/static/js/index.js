window.HELP_IMPROVE_VIDEOJS = false;


document.addEventListener("DOMContentLoaded", function () {
  var options = {
    slidesToScroll: 1,
    slidesToShow: 1,
    loop: true,
    infinite: true,
    autoplay: true,
    autoplaySpeed: 5000,
  };

  // Initialize all elements with carousel class when Bulma plugins are available.
  if (window.bulmaCarousel) {
    bulmaCarousel.attach(".carousel", options);
  }

  if (window.bulmaSlider) {
    bulmaSlider.attach();
  }
});
