(function () {
    var field = document.getElementById("stars-field");
    if (!field) return;
    var count = 100;
    for (var i = 0; i < count; i++) {
        var orbit = document.createElement("div");
        orbit.className = "star-orbit";
        var size = 120 + Math.random() * 900;
        var duration = 20 + Math.random() * 70;
        var delay = -(Math.random() * duration);
        var reverse = Math.random() > 0.5 ? "reverse" : "normal";
        orbit.style.width = size + "px";
        orbit.style.height = size + "px";
        orbit.style.animationDuration = duration + "s";
        orbit.style.animationDelay = delay + "s";
        orbit.style.animationDirection = reverse;

        var star = document.createElement("span");
        star.className = "star";
        var starSize = 1 + Math.random() * 2.5;
        var opacity = 0.2 + Math.random() * 0.7;
        star.style.width = starSize + "px";
        star.style.height = starSize + "px";
        star.style.marginLeft = -(starSize / 2) + "px";
        star.style.marginTop = -(starSize / 2) + "px";
        star.style.opacity = opacity;
        if (Math.random() > 0.7) {
            star.style.boxShadow = "0 0 " + (4 + Math.random() * 4) + "px rgba(255,255,255," + (0.4 + Math.random() * 0.4) + ")";
        }

        orbit.appendChild(star);
        field.appendChild(orbit);
    }
})();
