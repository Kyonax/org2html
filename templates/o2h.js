/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 */

/*
 * o2h.js — the O2H Style Book's default interactive runtime.
 *
 * A dependency-free (no framework, no build step) progressive-enhancement layer
 * that wires behaviour onto the STATIC component hooks the engine already emits
 * (.org-src-copy, [data-component], .org-carousel-strip, .org-figure img, …).
 * The engine only REFERENCES this file via <script src> ([D-28]); it never runs
 * it. Everything degrades gracefully: with JS off you keep the static looks +
 * the CSS-native interactions (scroll-snap carousel, <details> accordion).
 *
 * GENERATED nothing — hand-authored vanilla ES2019. Idempotent (guarded by a
 * data flag), namespaced, and quiet: an unenhanceable page is a no-op.
 */
(function () {
  "use strict"
  if (typeof document === "undefined") return

  var reduceMotion =
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches

  /** Mark a node handled so re-invocation (or a second include) is a no-op. */
  function once(el, key) {
    // A namespaced marker (data-o2h-init-*) so it never collides with the
    // SEMANTIC data-o2h-* attributes (data-o2h-open / -copy / -close).
    var k = "o2hInit" + key
    if (el.dataset[k]) return false
    el.dataset[k] = "1"
    return true
  }

  function on(el, ev, fn) {
    el.addEventListener(ev, fn)
  }

  function els(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel))
  }

  /* ── Copy to clipboard ───────────────────────────────────────────────────────
   * The code-chrome COPY button copies its block's code; a `command` component
   * copies its data-text; any [data-o2h-copy="<selector|text>"] copies that. */
  function copyText(text, btn) {
    var done = function () {
      if (!btn) return
      var prev = btn.textContent
      btn.textContent = "COPIED"
      btn.classList.add("is-copied")
      setTimeout(function () {
        btn.textContent = prev
        btn.classList.remove("is-copied")
      }, 1400)
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, done)
    } else {
      // Legacy fallback: a hidden textarea + execCommand.
      var ta = document.createElement("textarea")
      ta.value = text
      ta.setAttribute("readonly", "")
      ta.style.position = "absolute"
      ta.style.left = "-9999px"
      document.body.appendChild(ta)
      ta.select()
      try {
        document.execCommand("copy")
      } catch (e) {
        /* ignore */
      }
      document.body.removeChild(ta)
      done()
    }
  }

  function initCopy() {
    // Code-chrome buttons: copy the sibling <pre> block's text.
    els(".org-src-copy").forEach(function (btn) {
      if (!once(btn, "Copy")) return
      on(btn, "click", function () {
        var block = btn.closest(".org-src-block")
        var pre = block && block.querySelector("pre")
        if (pre) copyText((pre.innerText || pre.textContent || "").replace(/\n$/, ""), btn)
      })
    })
    // Explicit copy triggers: [data-o2h-copy] holds a selector or literal text.
    els("[data-o2h-copy]").forEach(function (btn) {
      if (!once(btn, "Copy")) return
      on(btn, "click", function () {
        var ref = btn.getAttribute("data-o2h-copy")
        var target = ref && document.querySelector(ref)
        copyText(target ? target.innerText : ref, btn)
      })
    })
    // A `command` component copies its own text on click.
    els('[data-component="command"]').forEach(function (el) {
      if (!once(el, "Copy")) return
      el.style.cursor = "pointer"
      on(el, "click", function () {
        copyText(el.getAttribute("data-text") || el.textContent, el)
      })
    })
  }

  /* ── Lightbox ────────────────────────────────────────────────────────────────
   * Click a content image (figure / carousel / gallery) to open it full-size in
   * a dismissible overlay. Esc or a click closes it. */
  var lightboxEl = null
  function openLightbox(src, alt) {
    closeLightbox()
    lightboxEl = document.createElement("div")
    lightboxEl.className = "org-lightbox-overlay"
    lightboxEl.setAttribute("role", "dialog")
    lightboxEl.setAttribute("aria-modal", "true")
    lightboxEl.setAttribute("aria-label", alt || "Image")
    var img = document.createElement("img")
    img.src = src
    img.alt = alt || ""
    lightboxEl.appendChild(img)
    on(lightboxEl, "click", closeLightbox)
    document.body.appendChild(lightboxEl)
    document.documentElement.style.overflow = "hidden"
  }
  function closeLightbox() {
    if (!lightboxEl) return
    document.documentElement.style.overflow = ""
    lightboxEl.remove()
    lightboxEl = null
  }
  function initLightbox() {
    els(".org-figure img, .org-carousel-strip img, [data-component=\"gallery\"] img, [data-o2h=\"lightbox\"] img").forEach(
      function (img) {
        if (!once(img, "Light")) return
        img.style.cursor = "zoom-in"
        on(img, "click", function () {
          openLightbox(img.currentSrc || img.src, img.alt)
        })
      },
    )
  }

  /* ── Carousel controls ───────────────────────────────────────────────────────
   * The .org-carousel-strip is a CSS scroll-snap strip (works by swipe alone);
   * add prev/next buttons, keyboard and a dot rail for pointer users, and make the
   * strip LOOP so neither arrow ever dead-ends. The looping is the runtime's alone:
   * with JavaScript off the strip is still a swipeable snap strip with a first and a
   * last slide, which is the honest fallback — nothing is hidden behind the wrap. */
  function initCarousel() {
    els(".org-carousel-strip").forEach(function (strip) {
      if (!once(strip, "Carousel")) return
      if (strip.children.length < 2) return
      strip.setAttribute("tabindex", "0")
      var wrap = document.createElement("div")
      wrap.className = "org-carousel"
      strip.parentNode.insertBefore(wrap, strip)
      wrap.appendChild(strip)

      var slides = Array.prototype.slice.call(strip.children)
      var dots = []

      /* THE ACTIVE DOT IS SET BY THE ACTION, NOT INFERRED FROM THE SCROLL. The rail
       * used to be driven only by the strip's scroll event, which makes the one piece
       * of state telling a reader where they are in a scrollbar-less strip depend on
       * an event that is coalesced, can arrive late, and — measured in this very
       * browser, where no scroll event fires at all — may not arrive. Navigating now
       * marks the destination immediately; the scroll handler stays, because a SWIPE
       * has no destination to announce and inferring it is the only way. */
      function setActive(i) {
        dots.forEach(function (d, k) {
          d.classList.toggle("is-active", k === i)
          if (k === i) d.setAttribute("aria-current", "true")
          else d.removeAttribute("aria-current")
        })
      }

      /* WHICH SLIDE ARE WE ON — one definition, shared by the buttons, the keyboard
       * and the dot rail. When the controls and the dots each answered that question
       * their own way they could disagree mid-swipe, and the active dot is the only
       * thing telling a reader where they are in a strip whose scrollbar is hidden. */
      function indexAt() {
        var mid = strip.scrollLeft + strip.clientWidth / 2
        var best = 0
        var bestD = Infinity
        slides.forEach(function (slide, i) {
          var c = slide.offsetLeft - strip.offsetLeft + slide.offsetWidth / 2
          var d = Math.abs(c - mid)
          if (d < bestD) { bestD = d; best = i }
        })
        return best
      }

      /* While a programmatic move is in flight the active dot is whatever we asked
       * for, not whatever the strip is passing over. -1 means "trust the scroll". */
      var pinned = -1
      var pinTimer = 0
      function pin(i, immediate) {
        pinned = i
        window.clearTimeout(pinTimer)
        pinTimer = window.setTimeout(function () { pinned = -1 }, immediate ? 120 : 600)
      }

      /* THE LANDING IS THE CONTRACT; THE ANIMATION IS AN ENHANCEMENT. A smooth
       * scrollTo is not guaranteed to do anything: with smooth scrolling switched
       * off in the browser it can be a NO-OP rather than an instant move, and then
       * the arrow is simply dead — measured here, where prev/next moved the strip by
       * zero pixels while an `instant` scroll to the same offset worked. So the move
       * is requested smoothly and then CHECKED: if the strip has not budged from
       * where it started a beat later, finish it outright. A scroll already in
       * flight, or a reader who started swiping in the meantime, has moved it — and
       * is left alone.
       *
       * `instant` and not `auto`: `auto` means "obey the CSS", and the sheet sets
       * scroll-behavior: smooth on this strip, so `auto` is the smooth path again. */
      function goTo(i, jump) {
        var slide = slides[i]
        if (!slide) return
        var left = slide.offsetLeft - strip.offsetLeft
        setActive(i)
        /* PIN THE DOT TO THE DESTINATION for the length of the move. The scroll
         * listener below recomputes the nearest slide on every frame, so during a
         * smooth scroll the active dot used to walk through every slide in between
         * and then snap back — the strip looked like it was searching for the
         * answer. The pin is released on a timer rather than on `scrollend`, which
         * is still not everywhere. */
        pin(i, jump)
        if (jump || reduceMotion) {
          /* A CUT MUST ACTUALLY CUT. `behavior: "instant"` moves the strip in one
           * frame, but the sheet also declares `scroll-snap-type: x mandatory` and
           * `scroll-behavior: smooth` — so the snap engine re-settles immediately
           * afterwards and animates that correction, and the wrap came out as a
           * teleport with a visible drift chasing it. Both are suspended for the
           * frame in which the jump lands and restored on the next one, so the seam
           * is one clean cut and everything else keeps the sheet's behaviour. */
          strip.style.scrollSnapType = "none"
          strip.style.scrollBehavior = "auto"
          strip.scrollTo({ left: left, behavior: "instant" })
          window.requestAnimationFrame(function () {
            strip.style.scrollSnapType = ""
            strip.style.scrollBehavior = ""
          })
          return
        }
        var from = strip.scrollLeft
        strip.scrollTo({ left: left, behavior: "smooth" })
        window.setTimeout(function () {
          if (strip.scrollLeft === from && from !== left) {
            strip.scrollTo({ left: left, behavior: "instant" })
          }
        }, 200)
      }

      /* THE STRIP LOOPS. Past the last slide is the first, and before the first is the
       * last, so a reader can keep pressing one arrow instead of hitting a wall they
       * have to notice and reverse out of. It is done by INDEX, not by cloning slides:
       * a cloned strip would duplicate every image in the lightbox collection and in
       * the dot rail, and pay for the illusion in bytes the reader never asked for.
       *
       * THE SEAM JUMPS, EVERY OTHER MOVE ANIMATES. Smooth-scrolling from the last slide
       * back to the first drags the entire strip past the reader at speed, which reads
       * as the carousel losing its place rather than wrapping; an instant move reads as
       * the loop it is. A one-step move keeps its animation, so only the wrap is cut. */
      function step(dir) {
        var n = slides.length
        var from = indexAt()
        var to = (from + dir + n) % n
        /* IT IS THE WRAP THAT CUTS, not the distance. Deciding on
         * `Math.abs(to - from) > 1` meant a TWO-slide strip animated its wrap
         * (|0-1| is 1) while a three-slide strip cut — the same gesture behaving
         * differently for no reason a reader could see. Asking whether the index
         * went backwards while moving forwards names the seam exactly, at any
         * length. */
        goTo(to, (dir > 0 && to < from) || (dir < 0 && to > from))
      }

      ;["prev", "next"].forEach(function (which) {
        var b = document.createElement("button")
        b.type = "button"
        b.className = "org-carousel-btn org-carousel-btn--" + which
        b.setAttribute("aria-label", which === "prev" ? "Previous" : "Next")
        b.textContent = which === "prev" ? "\u2039" : "\u203a"
        on(b, "click", function () {
          step(which === "prev" ? -1 : 1)
        })
        wrap.appendChild(b)
      })
      on(strip, "keydown", function (e) {
        if (e.key === "ArrowLeft") step(-1)
        if (e.key === "ArrowRight") step(1)
      })

      /* The control rail: prev · dots · next, one dot per slide. The reference
       * carousel (kyo-web-online now-projects) navigates by dots, not by a
       * scrollbar, so the dots are the primary affordance and the strip's own
       * scrollbar is hidden in CSS. */
      var rail = document.createElement("div")
      rail.className = "org-carousel-rail"
      slides.forEach(function (slide, i) {
        var d = document.createElement("button")
        d.type = "button"
        d.className = "org-carousel-dot"
        d.setAttribute("aria-label", "Go to slide " + (i + 1))
        on(d, "click", function () {
          /* Jumping from dot 1 to dot 6 smooth-scrolled the whole strip past the
           * reader — the very effect the seam cut exists to avoid. A neighbouring
           * dot still animates. */
          goTo(i, Math.abs(i - indexAt()) > 1)
        })
        rail.appendChild(d)
        dots.push(d)
      })
      wrap.appendChild(rail)

      /* Mark the slide nearest the strip's centre as active. Runs on scroll,
       * rAF-throttled, so a swipe repaints one class rather than every frame. */
      var ticking = false
      var syncDots = function () {
        setActive(pinned >= 0 ? pinned : indexAt())
        ticking = false
      }
      on(strip, "scroll", function () {
        if (ticking) return
        ticking = true
        window.requestAnimationFrame(syncDots)
      })
      syncDots()
    })
  }

  /* ── Embed facade (D-05) ─────────────────────────────────────────────────────
   * A [data-embed] stage ships a poster and a play target; the player mounts on
   * click and not before, so nothing is fetched from the video host until the
   * reader asks. The src is re-checked here against the same privacy-mode
   * pattern the sanitizer enforces — the runtime trusts no attribute it has not
   * verified itself. If the check fails the click is left alone, so the facade
   * stays what it is with JS off: a link to the video. */
  /* The one frame this runtime will ever mount, kept character-for-character in step with
   * src/renderer/sanitizer.ts: a URL the sanitizer would strip must never be one the
   * runtime is willing to mount. An X video needs no frame — it rides the "video" channel
   * below and becomes a real <video> — so this stays a single pattern. */
  var EMBED_SRC = /^https:\/\/(?:www\.)?youtube-nocookie\.com\/embed\/[\w-]{11}(?:[?#].*)?$/
  /* A local asset: a site-root or relative path, or an explicit https URL. Anything else
   * (javascript:, data:, //host) is refused and the facade stays a plain link. */
  var LOCAL_SRC = /^(?:\/(?!\/)|\.{1,2}\/|https:\/\/)[^\s"']+$/
  function initEmbeds() {
    els("[data-embed]").forEach(function (stage) {
      if (!once(stage, "Embed")) return
      var facade = stage.querySelector(".org-embed-facade")
      if (!facade) return
      on(facade, "click", function (e) {
        var kind = stage.getAttribute("data-embed") || ""
        var src = stage.getAttribute("data-embed-src") || ""
        var player

        if (kind === "video") {
          /* A LOCAL file: mount a real <video>, not a frame. Only same-origin paths and
           * https are accepted, so the attribute cannot smuggle in another scheme. */
          if (!LOCAL_SRC.test(src)) return
          player = document.createElement("video")
          player.src = src
          player.autoplay = true
          player.setAttribute("playsinline", "")
          player.className = "org-video"
        } else {
          if (!EMBED_SRC.test(src)) return
          player = document.createElement("iframe")
          player.src = src
          player.title = stage.getAttribute("data-embed-title") || "Video player"
          player.setAttribute("loading", "lazy")
          player.setAttribute("referrerpolicy", "strict-origin-when-cross-origin")
          player.setAttribute(
            "allow",
            "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          )
          player.setAttribute("allowfullscreen", "")
        }

        e.preventDefault()
        facade.replaceWith(player)
        stage.setAttribute("data-embed-state", "playing")
        /* A mounted <video> gets the book's own controls, the same as an authored one. */
        if (kind === "video") upgradeVideo(player)
        player.focus()
      })
    })
  }

  /* ── The video player ────────────────────────────────────────────────────────
   * A native <video> cannot be restyled inside its shadow controls, so the book takes
   * them over: `controls` comes off and a control bar is built out of real elements,
   * which the sheet then styles like every other piece of chrome on the page.
   *
   * PROGRESSIVE, AND IN THAT ORDER. An authored <video> ships WITH `controls` in the
   * HTML, so a reader with no JavaScript keeps a working player; the attribute is only
   * removed once the bar is built and wired. If any of this throws, the catch puts
   * `controls` back, so the failure mode is the browser's player rather than none. */
  var PLAYBACK_RATES = [1, 1.25, 1.5, 2]

  function fmtTime(s) {
    if (!isFinite(s) || s < 0) s = 0
    var m = Math.floor(s / 60), sec = Math.floor(s % 60)
    var h = Math.floor(m / 60)
    if (h > 0) return h + ":" + String(m % 60).padStart(2, "0") + ":" + String(sec).padStart(2, "0")
    return m + ":" + String(sec).padStart(2, "0")
  }

  function svgIcon(paths, cls) {
    var s = '<svg class="org-player-icon' + (cls ? " " + cls : "") +
      '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
    for (var i = 0; i < paths.length; i++) s += '<path d="' + paths[i] + '"/>'
    return s + "</svg>"
  }
  var ICON = {
    play: ["M8 5v14l11-7z"],
    pause: ["M6 5h4v14H6z", "M14 5h4v14h-4z"],
    volume: ["M4 9v6h4l5 4V5L8 9H4z", "M16.5 8.5a4.5 4.5 0 0 1 0 7"],
    muted: ["M4 9v6h4l5 4V5L8 9H4z", "M16 9.5l5 5", "M21 9.5l-5 5"],
    pip: ["M3 5h18v14H3z", "M12 12h7v5h-7z"],
    full: ["M4 9V4h5", "M20 9V4h-5", "M4 15v5h5", "M20 15v5h-5"],
    exit: ["M9 4v5H4", "M15 4v5h5", "M9 20v-5H4", "M15 20v-5h5"]
  }

  function upgradeVideo(video) {
    if (!once(video, "Player")) return
    var hadControls = video.hasAttribute("controls")
    try {
      video.classList.add("org-video")
      var shell = document.createElement("div")
      shell.className = "org-player"
      video.parentNode.insertBefore(shell, video)
      shell.appendChild(video)

      var bar = document.createElement("div")
      bar.className = "org-player-bar"
      /* The scrubber is a real <input type="range">: it arrives keyboard-operable and
       * announced as a slider, which a div with pointer handlers never is. */
      bar.innerHTML =
        '<button class="org-player-btn org-player-play" type="button" aria-label="Play">' +
          svgIcon(ICON.play, "is-play") + svgIcon(ICON.pause, "is-pause") + "</button>" +
        '<div class="org-player-track">' +
          '<div class="org-player-buffered"></div>' +
          '<div class="org-player-played"></div>' +
          '<input class="org-player-seek" type="range" min="0" max="1000" value="0" step="1" ' +
            'aria-label="Seek">' +
        "</div>" +
        '<span class="org-player-time"><span class="org-player-now">0:00</span>' +
          '<span class="org-player-sep">/</span>' +
          '<span class="org-player-dur">0:00</span></span>' +
        '<button class="org-player-btn org-player-mute" type="button" aria-label="Mute">' +
          svgIcon(ICON.volume, "is-on") + svgIcon(ICON.muted, "is-off") + "</button>" +
        '<input class="org-player-vol" type="range" min="0" max="100" value="100" step="1" ' +
          'aria-label="Volume">' +
        '<button class="org-player-btn org-player-rate" type="button" aria-label="Playback speed">1&times;</button>' +
        '<button class="org-player-btn org-player-pip" type="button" aria-label="Picture in picture">' +
          svgIcon(ICON.pip) + "</button>" +
        '<button class="org-player-btn org-player-full" type="button" aria-label="Fullscreen">' +
          svgIcon(ICON.full, "is-in") + svgIcon(ICON.exit, "is-out") + "</button>"
      shell.appendChild(bar)

      var big = document.createElement("button")
      big.className = "org-player-big"
      big.type = "button"
      big.setAttribute("aria-label", "Play")
      big.innerHTML = svgIcon(ICON.play)
      shell.appendChild(big)

      var q = function (s) { return shell.querySelector(s) }
      var playBtn = q(".org-player-play"), seek = q(".org-player-seek")
      var played = q(".org-player-played"), buffered = q(".org-player-buffered")
      var now = q(".org-player-now"), dur = q(".org-player-dur")
      var muteBtn = q(".org-player-mute"), vol = q(".org-player-vol")
      var rateBtn = q(".org-player-rate"), pipBtn = q(".org-player-pip")
      var fullBtn = q(".org-player-full")

      /* Picture-in-picture is not everywhere; a control that cannot work is not shown
       * rather than shown broken. */
      if (!document.pictureInPictureEnabled || video.disablePictureInPicture) pipBtn.remove()

      var seeking = false

      function paint() {
        var d = video.duration
        if (isFinite(d) && d > 0) {
          if (!seeking) seek.value = String(Math.round((video.currentTime / d) * 1000))
          played.style.width = ((video.currentTime / d) * 100).toFixed(3) + "%"
          dur.textContent = fmtTime(d)
          seek.setAttribute("aria-valuetext", fmtTime(video.currentTime) + " of " + fmtTime(d))
        }
        now.textContent = fmtTime(video.currentTime)
        if (video.buffered.length && isFinite(video.duration) && video.duration > 0) {
          buffered.style.width =
            ((video.buffered.end(video.buffered.length - 1) / video.duration) * 100).toFixed(3) + "%"
        }
      }
      function paintPlay() {
        var p = video.paused || video.ended
        shell.setAttribute("data-state", p ? "paused" : "playing")
        playBtn.setAttribute("aria-label", p ? "Play" : "Pause")
        big.setAttribute("aria-label", p ? "Play" : "Pause")
      }
      function paintVol() {
        var off = video.muted || video.volume === 0
        shell.setAttribute("data-muted", off ? "true" : "false")
        muteBtn.setAttribute("aria-label", off ? "Unmute" : "Mute")
        vol.value = String(Math.round((video.muted ? 0 : video.volume) * 100))
      }
      function toggle() { if (video.paused || video.ended) video.play(); else video.pause() }

      on(playBtn, "click", toggle)
      on(big, "click", toggle)
      on(video, "click", toggle)
      on(video, "play", paintPlay)
      on(video, "pause", paintPlay)
      on(video, "ended", paintPlay)
      on(video, "timeupdate", paint)
      on(video, "progress", paint)
      on(video, "loadedmetadata", function () { paint(); paintPlay(); paintVol() })
      on(video, "volumechange", paintVol)

      on(seek, "input", function () {
        var d = video.duration
        if (!isFinite(d) || d <= 0) return
        seeking = true
        var t = (Number(seek.value) / 1000) * d
        played.style.width = ((t / d) * 100).toFixed(3) + "%"
        now.textContent = fmtTime(t)
      })
      on(seek, "change", function () {
        var d = video.duration
        if (isFinite(d) && d > 0) video.currentTime = (Number(seek.value) / 1000) * d
        seeking = false
      })

      on(muteBtn, "click", function () { video.muted = !video.muted })
      on(vol, "input", function () {
        video.muted = false
        video.volume = Number(vol.value) / 100
      })
      on(rateBtn, "click", function () {
        var i = PLAYBACK_RATES.indexOf(video.playbackRate)
        var next = PLAYBACK_RATES[(i + 1) % PLAYBACK_RATES.length]
        video.playbackRate = next
        rateBtn.innerHTML = (next === 1 ? "1" : String(next)) + "&times;"
      })
      if (pipBtn) {
        on(pipBtn, "click", function () {
          if (document.pictureInPictureElement) document.exitPictureInPicture()
          else if (video.requestPictureInPicture) video.requestPictureInPicture()
        })
      }
      on(fullBtn, "click", function () {
        if (document.fullscreenElement) document.exitFullscreen()
        else if (shell.requestFullscreen) shell.requestFullscreen()
      })
      on(document, "fullscreenchange", function () {
        shell.setAttribute("data-full", document.fullscreenElement === shell ? "true" : "false")
      })

      /* Keyboard, on the SHELL rather than the document: a page with three videos must not
       * have the spacebar reach all of them, and a reader scrolling with space must not
       * pause a video they are not looking at. */
      shell.tabIndex = 0
      on(shell, "keydown", function (e) {
        var t = e.target
        /* The range inputs own the arrow keys — seeking and volume already work there. */
        if (t && (t.tagName === "INPUT" || (t.tagName === "BUTTON" && e.key === " "))) return
        var d = video.duration, done = true
        if (e.key === " " || e.key === "k") toggle()
        else if (e.key === "ArrowRight") video.currentTime = Math.min(d || 0, video.currentTime + 5)
        else if (e.key === "ArrowLeft") video.currentTime = Math.max(0, video.currentTime - 5)
        else if (e.key === "l") video.currentTime = Math.min(d || 0, video.currentTime + 10)
        else if (e.key === "j") video.currentTime = Math.max(0, video.currentTime - 10)
        else if (e.key === "ArrowUp") video.volume = Math.min(1, video.volume + 0.1)
        else if (e.key === "ArrowDown") video.volume = Math.max(0, video.volume - 0.1)
        else if (e.key === "m") video.muted = !video.muted
        else if (e.key === "f") fullBtn.click()
        else if (e.key === "Home") video.currentTime = 0
        else if (e.key === "End" && isFinite(d)) video.currentTime = d
        else done = false
        if (done) e.preventDefault()
      })

      /* The bar retreats while playing and comes back on any sign of attention. It NEVER
       * hides while paused, while the pointer is on it, or while focus is inside it —
       * a control that vanishes under the cursor is worse than one always on show. */
      var idle
      function wake() {
        shell.setAttribute("data-idle", "false")
        clearTimeout(idle)
        idle = setTimeout(function () {
          if (!video.paused && !shell.contains(document.activeElement) && !shell.matches(":hover")) {
            shell.setAttribute("data-idle", "true")
          }
        }, 2600)
      }
      on(shell, "pointermove", wake)
      on(shell, "pointerleave", function () { if (!video.paused) shell.setAttribute("data-idle", "true") })
      on(shell, "focusin", wake)
      on(video, "play", wake)

      video.removeAttribute("controls")
      paint(); paintPlay(); paintVol(); wake()
    } catch (err) {
      /* Anything unexpected and the browser's own player comes back, rather than none. */
      if (hadControls) video.setAttribute("controls", "")
    }
  }

  function initVideoPlayer() {
    els(".org-root video, .org-embed-stage video").forEach(upgradeVideo)
  }

  /* ── Toggle ──────────────────────────────────────────────────────────────────
   * A `toggle` component flips its data-state on click (a real switch). */
  function initToggle() {
    els('[data-component="toggle"]').forEach(function (el) {
      if (!once(el, "Toggle")) return
      el.setAttribute("role", "switch")
      var set = function (on_) {
        el.setAttribute("data-state", on_ ? "on" : "off")
        el.setAttribute("aria-checked", on_ ? "true" : "false")
      }
      set(el.getAttribute("data-state") === "on")
      if (el.tabIndex < 0) el.tabIndex = 0
      on(el, "click", function () {
        set(el.getAttribute("data-state") !== "on")
      })
      on(el, "keydown", function (e) {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault()
          set(el.getAttribute("data-state") !== "on")
        }
      })
    })
  }

  /* ── Tabs ────────────────────────────────────────────────────────────────────
   * Enhance a [data-o2h="tabs"] block: buttons[data-tab="id"] switch which
   * [data-panel="id"] is visible. */
  function initTabs() {
    els('[data-o2h="tabs"]').forEach(function (root) {
      if (!once(root, "Tabs")) return
      var tabs = els("[data-tab]", root)
      var panels = els("[data-panel]", root)
      if (!tabs.length) return
      var activate = function (id) {
        tabs.forEach(function (t) {
          var active = t.getAttribute("data-tab") === id
          t.setAttribute("aria-selected", active ? "true" : "false")
          t.classList.toggle("is-active", active)
        })
        panels.forEach(function (p) {
          p.hidden = p.getAttribute("data-panel") !== id
        })
      }
      tabs.forEach(function (t) {
        t.setAttribute("role", "tab")
        on(t, "click", function () {
          activate(t.getAttribute("data-tab"))
        })
      })
      activate(tabs[0].getAttribute("data-tab"))
    })
  }

  /* ── Modal / dialog ──────────────────────────────────────────────────────────
   * [data-o2h-open="id"] opens the [data-o2h="modal"][id]; backdrop / Esc /
   * [data-o2h-close] closes it. */
  function initModal() {
    var openModal = function (m) {
      m.classList.add("is-open")
      m.setAttribute("aria-hidden", "false")
      document.documentElement.style.overflow = "hidden"
    }
    var closeModal = function (m) {
      m.classList.remove("is-open")
      m.setAttribute("aria-hidden", "true")
      document.documentElement.style.overflow = ""
    }
    els("[data-o2h-open]").forEach(function (btn) {
      if (!once(btn, "Open")) return
      on(btn, "click", function () {
        var m = document.getElementById(btn.getAttribute("data-o2h-open"))
        if (m) openModal(m)
      })
    })
    els('[data-o2h="modal"]').forEach(function (m) {
      if (!once(m, "Modal")) return
      m.setAttribute("aria-hidden", "true")
      on(m, "click", function (e) {
        if (e.target === m || (e.target.hasAttribute && e.target.hasAttribute("data-o2h-close")))
          closeModal(m)
      })
    })
    on(document, "keydown", function (e) {
      if (e.key !== "Escape") return
      closeLightbox()
      els('[data-o2h="modal"].is-open').forEach(closeModal)
    })
  }

  /* ── Toast auto-dismiss ──────────────────────────────────────────────────────*/
  function initToast() {
    els('[data-component="toast"]').forEach(function (t) {
      if (!once(t, "Toast")) return
      var ms = parseInt(t.getAttribute("data-timeout") || "4000", 10)
      if (ms > 0)
        setTimeout(function () {
          t.classList.add("is-hidden")
        }, ms)
    })
  }

  /* ── Back-to-top FAB ─────────────────────────────────────────────────────────
   * The runtime owns exactly ONE floating button, under its OWN hook.
   *
   * It used to adopt any [data-component="back-to-top"] it found. But that attribute
   * marks a STATIC SKIN SAMPLE — the audit page prints one in its component list, the
   * same as every other data-component placeholder — so adopting it turned a swatch
   * into a live fixed FAB. Worse, in an SPA the first boot ran before the article
   * existed, found nothing and injected a real button; the second boot then found the
   * sample and promoted it too, leaving TWO overlapping fixed FABs on the page.
   *
   * Own hook, one instance, idempotent across boots. A sample stays a sample. */
  function initBackToTop() {
    var fab = document.querySelector('[data-o2h="back-to-top"]')
    if (fab) {
      if (!once(fab, "Top")) return
    } else {
      fab = document.createElement("button")
      fab.type = "button"
      fab.setAttribute("data-o2h", "back-to-top")
      fab.setAttribute("aria-label", "Back to top")
      fab.className = "org-back-to-top"
      /* A fixed element belongs on <body>: any ancestor carrying a transform, filter
       * or perspective would otherwise become its containing block. */
      document.body.appendChild(fab)
      once(fab, "Top")
    }
    var toggle = function () {
      fab.classList.toggle("is-visible", (window.pageYOffset || 0) > 600)
    }
    on(window, "scroll", toggle, { passive: true })
    toggle()
    on(fab, "click", function () {
      window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" })
    })
  }

  /* ── Read-progress bar ───────────────────────────────────────────────────────*/
  /* ── The diagram viewer ──────────────────────────────────────────────────────
   * A diagram is READ, not glanced at, so a big one gets a frame it can be moved
   * around inside: drag to pan, zoom by button, ctrl/cmd-wheel, double click or
   * pinch, arrow keys and + - 0, and a PNG of the whole drawing.
   *
   * ZOOM MOVES THE viewBox — it does NOT apply a CSS transform. The drawing stays
   * vector-crisp at every level, the PNG renders from the same geometry the screen
   * is showing, and because the viewBox aspect never changes the frame never reflows.
   *
   * PROGRESSIVE BY CONSTRUCTION. Everything runs inside a guard: if any of it
   * throws, the diagram is left exactly as the stylesheet drew it — which is
   * already a complete, readable, scrollable figure. The viewer is an addition,
   * never a dependency. */
  var DG_MIN = 1, DG_MAX = 10, DG_STEP = 1.35
  function dgClamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v }
  function dgSlug(text) {
    return String(text || "diagram").toLowerCase()
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "diagram"
  }
  /* A serialised SVG does NOT carry the page stylesheet, so a clone would rasterise
   * unstyled. Every painted property is resolved and written onto the clone first. */
  var DG_PROPS = ["fill", "fill-opacity", "stroke", "stroke-width", "stroke-dasharray",
    "stroke-linecap", "stroke-linejoin", "opacity", "font-family", "font-size",
    "font-weight", "font-style", "letter-spacing", "text-anchor", "dominant-baseline"]

  function dgSetup(svg) {
    var NS = "http://www.w3.org/2000/svg"
    var frame = svg.parentNode
    var vb = (svg.getAttribute("viewBox") || "").trim().split(/[\s,]+/).map(Number)
    if (vb.length !== 4 || !isFinite(vb[2]) || vb[2] <= 0) return

    var home = { x: vb[0], y: vb[1], w: vb[2], h: vb[3] }
    var view = { x: home.x, y: home.y, w: home.w, h: home.h }

    /* The stage owns the clipping and the aspect ratio, so the frame keeps whatever
     * padding and border the book already gave it. */
    var stage = document.createElement("div")
    stage.className = "org-diagram-stage"
    stage.style.aspectRatio = home.w + " / " + home.h
    stage.tabIndex = 0
    stage.setAttribute("role", "application")
    var label = svg.getAttribute("aria-label") ||
      (svg.querySelector("title") && svg.querySelector("title").textContent) || "Diagram"
    stage.setAttribute("aria-label", label + ". Drag to move, and use the zoom buttons or the arrow keys.")
    frame.insertBefore(stage, svg)
    stage.appendChild(svg)
    frame.classList.add("is-interactive")

    var tools = document.createElement("div")
    tools.className = "org-diagram-tools"
    var zoomLabel, outBtn, inBtn

    function button(act, text, title) {
      var b = document.createElement("button")
      b.type = "button"
      b.textContent = text
      b.title = title
      b.setAttribute("aria-label", title)
      on(b, "click", function (e) { e.preventDefault(); act() })
      tools.appendChild(b)
      return b
    }

    function apply() {
      svg.setAttribute("viewBox", view.x + " " + view.y + " " + view.w + " " + view.h)
      var pct = Math.round((home.w / view.w) * 100)
      zoomLabel.textContent = pct + "%"
      zoomLabel.setAttribute("aria-label", "Zoom " + pct + " percent")
      outBtn.disabled = home.w / view.w <= DG_MIN + 0.001
      inBtn.disabled = home.w / view.w >= DG_MAX - 0.001
    }

    /* Keep the drawing inside its frame: pinned at fit, and past that free to travel
     * exactly as far as the hidden part reaches. */
    function clampView() {
      view.w = dgClamp(view.w, home.w / DG_MAX, home.w)
      view.h = view.w * (home.h / home.w)
      view.x = dgClamp(view.x, home.x, home.x + home.w - view.w)
      view.y = dgClamp(view.y, home.y, home.y + home.h - view.h)
    }

    /* Zoom about a fixed point given in 0..1 across the stage, so whatever sits under
     * the cursor stays under the cursor. */
    function zoomAt(factor, fx, fy) {
      var ax = view.x + view.w * fx, ay = view.y + view.h * fy
      view.w = dgClamp(view.w / factor, home.w / DG_MAX, home.w)
      view.h = view.w * (home.h / home.w)
      view.x = ax - view.w * fx
      view.y = ay - view.h * fy
      clampView(); apply()
    }
    function zoomCentre(f) { zoomAt(f, 0.5, 0.5) }
    function fit() { view.x = home.x; view.y = home.y; view.w = home.w; view.h = home.h; apply() }

    outBtn = button(function () { zoomCentre(1 / DG_STEP) }, "−", "Zoom out")
    zoomLabel = document.createElement("span")
    zoomLabel.className = "org-diagram-zoom"
    zoomLabel.setAttribute("role", "status")
    tools.appendChild(zoomLabel)
    inBtn = button(function () { zoomCentre(DG_STEP) }, "+", "Zoom in")
    button(fit, "Fit", "Fit the whole diagram")
    var pngBtn = button(function () { exportPng(pngBtn) }, "PNG",
      "Download the whole diagram as a PNG image")
    frame.appendChild(tools)

    var hint = document.createElement("p")
    hint.className = "org-diagram-hint"
    hint.textContent = "Drag to move around. Zoom with the buttons, with a double click, " +
      "or by holding ctrl (cmd on a Mac) while scrolling."
    if (frame.nextSibling) frame.parentNode.insertBefore(hint, frame.nextSibling)
    else frame.parentNode.appendChild(hint)

    /* ---- pan by pointer, and pinch when there are two of them ---- */
    var points = new Map(), last = null, pinch = null

    function stageXY(e) {
      var r = stage.getBoundingClientRect()
      return { fx: (e.clientX - r.left) / r.width, fy: (e.clientY - r.top) / r.height }
    }

    on(stage, "pointerdown", function (e) {
      if (e.button !== 0 && e.pointerType === "mouse") return
      /* Capture keeps a drag alive past the edge of the frame. It is an improvement,
       * not a requirement, so a refusal must not stop the pan. */
      try { stage.setPointerCapture(e.pointerId) } catch (err) { /* pan without it */ }
      points.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (points.size === 1) { last = { x: e.clientX, y: e.clientY }; frame.classList.add("is-panning") }
      else if (points.size === 2) {
        var p = Array.from(points.values())
        pinch = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y)
      }
      e.preventDefault()
    })

    on(stage, "pointermove", function (e) {
      if (!points.has(e.pointerId)) return
      points.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (points.size === 2 && pinch) {
        var p = Array.from(points.values())
        var dist = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y)
        if (dist > 0) {
          var r = stage.getBoundingClientRect()
          zoomAt(dist / pinch,
            dgClamp(((p[0].x + p[1].x) / 2 - r.left) / r.width, 0, 1),
            dgClamp(((p[0].y + p[1].y) / 2 - r.top) / r.height, 0, 1))
          pinch = dist
        }
        return
      }
      if (!last) return
      var rect = stage.getBoundingClientRect()
      view.x -= (e.clientX - last.x) * (view.w / rect.width)
      view.y -= (e.clientY - last.y) * (view.h / rect.height)
      last = { x: e.clientX, y: e.clientY }
      clampView(); apply()
    })

    function release(e) {
      points.delete(e.pointerId)
      if (points.size < 2) pinch = null
      if (points.size === 0) { last = null; frame.classList.remove("is-panning") }
    }
    on(stage, "pointerup", release)
    on(stage, "pointercancel", release)

    /* Plain scrolling belongs to the PAGE. On a long document a wheel-zoom hijacks
     * the reader's scroll, so only ctrl/cmd zooms — which is also what a trackpad
     * pinch sends. The hint line says so. */
    stage.addEventListener("wheel", function (e) {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      var at = stageXY(e)
      zoomAt(e.deltaY < 0 ? DG_STEP : 1 / DG_STEP, dgClamp(at.fx, 0, 1), dgClamp(at.fy, 0, 1))
    }, { passive: false })

    on(stage, "dblclick", function (e) {
      e.preventDefault()
      var at = stageXY(e)
      zoomAt(DG_STEP * DG_STEP, dgClamp(at.fx, 0, 1), dgClamp(at.fy, 0, 1))
    })

    on(stage, "keydown", function (e) {
      var pan = view.w * 0.12, done = true
      if (e.key === "ArrowLeft") view.x -= pan
      else if (e.key === "ArrowRight") view.x += pan
      else if (e.key === "ArrowUp") view.y -= pan
      else if (e.key === "ArrowDown") view.y += pan
      else if (e.key === "+" || e.key === "=") zoomCentre(DG_STEP)
      else if (e.key === "-" || e.key === "_") zoomCentre(1 / DG_STEP)
      else if (e.key === "0") fit()
      else done = false
      if (done) { e.preventDefault(); clampView(); apply() }
    })

    /* ---- PNG: always the WHOLE diagram, never the current view ----
     * "Give me this diagram as an image" is the real request. */
    function exportPng(btn) {
      var text = btn.textContent
      btn.disabled = true; btn.textContent = "..."
      function restore() { btn.disabled = false; btn.textContent = text }
      try {
        var scale = 2
        var clone = svg.cloneNode(true)
        clone.setAttribute("xmlns", NS)
        clone.setAttribute("viewBox", home.x + " " + home.y + " " + home.w + " " + home.h)
        clone.setAttribute("width", home.w * scale)
        clone.setAttribute("height", home.h * scale)

        var live = svg.querySelectorAll("*"), copy = clone.querySelectorAll("*")
        for (var i = 0; i < live.length && i < copy.length; i++) {
          var cs = window.getComputedStyle(live[i])
          for (var j = 0; j < DG_PROPS.length; j++) {
            var v = cs.getPropertyValue(DG_PROPS[j])
            if (v) copy[i].style.setProperty(DG_PROPS[j], v)
          }
        }

        /* The page's paper, resolved from the book, so the PNG is not transparent
         * and does not assume a white host. */
        var paper = window.getComputedStyle(document.querySelector(".org-root") || document.body)
          .backgroundColor || "#ffffff"
        var bg = document.createElementNS(NS, "rect")
        bg.setAttribute("x", home.x); bg.setAttribute("y", home.y)
        bg.setAttribute("width", home.w); bg.setAttribute("height", home.h)
        bg.setAttribute("fill", paper)
        clone.insertBefore(bg, clone.firstChild)

        var xml = new XMLSerializer().serializeToString(clone)
        var url = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml;charset=utf-8" }))
        var img = new Image()
        img.onload = function () {
          try {
            var canvas = document.createElement("canvas")
            canvas.width = Math.round(home.w * scale)
            canvas.height = Math.round(home.h * scale)
            var ctx = canvas.getContext("2d")
            ctx.fillStyle = paper
            ctx.fillRect(0, 0, canvas.width, canvas.height)
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
            URL.revokeObjectURL(url)
            /* Name it after the diagram's OWN <title>, which is its name; a caption is a
             * sentence about it and may carry the viewer's instructions, which slugged into
             * "the-conversion-pipeline-drag-to-pan-zoom-with-th.png". Fall back to the
             * caption, then to the section heading. */
            var fig = frame.closest(".org-diagram")
            var t = svg.querySelector("title")
            var cap = fig && fig.querySelector(".org-diagram-caption")
            var sect = fig && fig.closest(".org-section")
            var head = sect && sect.querySelector("h1,h2,h3,h4")
            var name = dgSlug(
              (t && t.textContent) || (cap && cap.textContent) ||
              (head && head.textContent) || label) + ".png"
            canvas.toBlob(function (blob) {
              if (!blob) { restore(); return }
              var href = URL.createObjectURL(blob)
              var a = document.createElement("a")
              a.href = href; a.download = name
              document.body.appendChild(a); a.click(); a.remove()
              setTimeout(function () { URL.revokeObjectURL(href) }, 4000)
              restore()
            }, "image/png")
          } catch (err) { URL.revokeObjectURL(url); restore() }
        }
        img.onerror = function () { URL.revokeObjectURL(url); restore() }
        img.src = url
      } catch (err) { restore() }
    }

    /* Open on the whole diagram when the frame can afford to show it, and otherwise
     * at the size the labels were drawn for — which is what the plain scrolling
     * frame did before the viewer existed. */
    function open() {
      var width = stage.getBoundingClientRect().width
      if (width > 0 && width < home.w) {
        view.w = home.w * (width / home.w)
        view.h = view.w * (home.h / home.w)
      }
      clampView(); apply()
    }
    open()

    var settled = false
    on(window, "resize", function () {
      if (settled) return
      settled = true
      setTimeout(function () { settled = false; clampView(); apply() }, 150)
    })
  }

  function initDiagrams() {
    els(".org-diagram-scroll > svg").forEach(function (svg) {
      if (!once(svg, "Diagram")) return
      try { dgSetup(svg) } catch (err) { /* leave the diagram as the sheet drew it */ }
    })
  }

  function initReadProgress() {
    if (document.querySelector(".org-read-progress")) return
    var bar = document.createElement("div")
    bar.className = "org-read-progress"
    bar.setAttribute("aria-hidden", "true")
    var fill = document.createElement("i")
    bar.appendChild(fill)
    document.body.appendChild(bar)
    var update = function () {
      var h = document.documentElement
      var max = h.scrollHeight - h.clientHeight
      fill.style.width = (max > 0 ? ((h.scrollTop || window.pageYOffset) / max) * 100 : 0) + "%"
    }
    on(window, "scroll", update, { passive: true })
    on(window, "resize", update, { passive: true })
    update()
  }

  /* ── Table panning ───────────────────────────────────────────────────────────
   * The engine already ships every table inside a .org-table-scroll frame, so a page
   * with no JavaScript has a scrollable table and loses nothing. This adds the two
   * things a script can add: it says WHETHER a given table actually overflows, and it
   * lets a mouse drag the table sideways the way the diagram stage can be dragged.
   *
   * TOUCH IS LEFT ALONE ON PURPOSE. A finger already pans a scroll container natively,
   * and hijacking it would mean owning the momentum, the bounce and the vertical
   * gesture — the frame deliberately sets no `touch-action`, so a swipe UP over a wide
   * table still scrolls the page. Only a mouse gets the grab. */
  function initTables() {
    els(".org-table-scroll").forEach(function (frame) {
      if (!once(frame, "TableScroll")) return

      var overflows = function () {
        return frame.scrollWidth - frame.clientWidth > 1
      }

      /* A SCROLLABLE REGION HAS TO BE REACHABLE FROM A KEYBOARD, and only a scrollable
       * one should be: putting a tab stop on every table in a document would make the
       * keyboard path through a page longer for no gain. The name comes from the
       * caption when the table has one — an unnamed region is announced as nothing in
       * particular, which is worse than not claiming to be a region at all. */
      var sync = function () {
        var over = overflows()
        frame.classList.toggle("is-scrollable", over)
        if (over) {
          if (!frame.hasAttribute("tabindex")) frame.setAttribute("tabindex", "0")
          var caption = frame.querySelector(".org-table-caption")
          var name = caption ? caption.textContent.trim() : ""
          if (name && !frame.hasAttribute("aria-label")) {
            frame.setAttribute("role", "region")
            frame.setAttribute("aria-label", name)
          }
        } else {
          frame.removeAttribute("tabindex")
          frame.removeAttribute("role")
          frame.removeAttribute("aria-label")
        }
      }
      sync()
      if (window.ResizeObserver) new window.ResizeObserver(sync).observe(frame)
      else on(window, "resize", sync, { passive: true })

      var startX = 0
      var startY = 0
      var startLeft = 0
      var armed = false
      var panning = false

      on(frame, "pointerdown", function (e) {
        /* Mouse only, primary button only, and only when there is somewhere to go. */
        if (e.pointerType !== "mouse" || e.button !== 0 || !overflows()) return
        armed = true
        panning = false
        swallowClick = false
        startX = e.clientX
        startY = e.clientY
        startLeft = frame.scrollLeft
      })

      on(frame, "pointermove", function (e) {
        if (!armed) return
        var dx = e.clientX - startX
        var dy = e.clientY - startY
        if (!panning) {
          /* THE THRESHOLD IS WHAT KEEPS THE TABLE SELECTABLE. A table is exactly the
           * thing a reader copies out of, so a drag only becomes a pan once it has
           * committed to the horizontal — far enough to not be a click, and further
           * across than down. Anything shorter, or anything vertical, is left to the
           * browser and selects text as it always did. */
          if (Math.abs(dx) < 8 || Math.abs(dx) <= Math.abs(dy)) return
          panning = true
          frame.classList.add("is-panning")
          /* Capture keeps the drag alive past the edge of the frame. It is an
           * improvement, not a requirement, so a refusal must not stop the pan. */
          try { frame.setPointerCapture(e.pointerId) } catch (err) { /* pan without it */ }
          var sel = window.getSelection && window.getSelection()
          if (sel && sel.removeAllRanges) sel.removeAllRanges()
        }
        frame.scrollLeft = startLeft - dx
        e.preventDefault()
      })

      /* A pan that finishes on top of a link would otherwise fire that link's click on
       * the way up, and the reader would be navigated away by a gesture that meant
       * "move this". The flag has to OUTLIVE the pan: pointerup runs before click, so
       * testing the panning state itself would always test false by the time it
       * mattered. It is cleared by the click it is there to swallow, and on the next
       * pointerdown in case no click ever comes. */
      var swallowClick = false

      var end = function (e) {
        if (panning) {
          swallowClick = true
          try { frame.releasePointerCapture(e.pointerId) } catch (err) { /* already gone */ }
        }
        armed = false
        panning = false
        frame.classList.remove("is-panning")
      }
      on(frame, "pointerup", end)
      on(frame, "pointercancel", end)

      on(
        frame,
        "click",
        function (e) {
          if (!swallowClick) return
          swallowClick = false
          e.preventDefault()
          e.stopPropagation()
        },
        true,
      )
    })
  }

  /*
   * THE HOST DECIDES WHICH ENHANCEMENTS RUN.
   *
   * Every feature below is an enhancement, and a host that already owns one of
   * them does not want a second. A site with its own image viewer got TWO
   * overlays on one click; a site that does not want a reading-progress bar got
   * one welded to <body> anyway. Neither could be turned off: `boot()` called
   * all thirteen unconditionally, the guard flags are set by the initialisers
   * themselves so pre-setting them is a race the host usually loses, and the
   * listeners are anonymous so nothing can unbind them afterwards.
   *
   * So the runtime reads `window.O2H_CONFIG` before it does anything. Any key
   * set to `false` turns that feature off; everything else stays on, which
   * keeps the default behaviour identical for every host that never sets it.
   * Read ONCE, at boot, so a later mutation cannot half-enable a feature whose
   * markup was never prepared.
   *
   *   <script>window.O2H_CONFIG = { lightbox: false, readProgress: false }</script>
   *   <script src="/o2h.js" defer></script>
   *
   * An inline script is not deferred, so it always runs first — which is the
   * point: this is a decision the host makes BEFORE the runtime exists, not a
   * race it has to win afterwards.
   */
  var FEATURES = [
    ["copy", initCopy],
    ["lightbox", initLightbox],
    ["carousel", initCarousel],
    ["tables", initTables],
    ["embeds", initEmbeds],
    ["toggle", initToggle],
    ["tabs", initTabs],
    ["modal", initModal],
    ["toast", initToast],
    ["backToTop", initBackToTop],
    ["readProgress", initReadProgress],
    ["diagrams", initDiagrams],
    ["videoPlayer", initVideoPlayer],
  ]

  var config = (typeof window !== "undefined" && window.O2H_CONFIG) || {}

  function boot() {
    FEATURES.forEach(function (feature) {
      if (config[feature[0]] === false) return
      feature[1]()
    })
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot)
  } else {
    boot()
  }

  /* A manual re-scan for dynamically inserted content, the resolved config so a
     host can see what actually took effect, and the individual initialisers for
     a host that wants to compose its own boot order. */
  window.O2H = {
    enhance: boot,
    config: config,
    features: FEATURES.reduce(function (map, feature) {
      map[feature[0]] = feature[1]
      return map
    }, {}),
  }
})()
