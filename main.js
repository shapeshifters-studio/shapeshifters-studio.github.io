/*
 * The sequence: logo > three films with red lines > ENTER THE VOID + email > flower.
 *
 * Every film is downloaded completely while the logo is on screen, then played
 * from memory, so nothing has to load mid-sequence. On a slow connection the
 * logo stays longer and lighter versions of the films are used.
 */

// Timings, in milliseconds.
const LOGO_FADE = 1200; // same as .logo in styles.css
const LOGO_HOLD = 2000; // minimum time at full opacity
const TEXT_IN_AT = 250; // after the film starts
const TEXT_OUT_BEFORE_END = 1100;
const GATE_IN_AT = 700;
const THANKS_IN_AT = 900; // after the flower starts

// Loading.
const SLOW_AFTER = 5000; // still under 40% by then: switch to the light version
const NO_DATA_TIMEOUT = 15000; // a download receiving nothing is restarted
const MAX_TRIES = 6; // then that film is skipped: its text shows on black
const FROZEN_AFTER = 8000; // a film that stops moving is skipped
const SIGNUP_TIMEOUT = 15000;

const films = Array.from(document.querySelectorAll(".films video"));
const [film1, film2, film3, filmVoid, filmFlower] = films;
const logo = document.querySelector(".logo");
const nav = document.querySelector(".nav");
const thanks = document.querySelector(".thanks");
const title = document.getElementById("gate-title");
const grain = document.querySelector("#grain feDisplacementMap");
const gate = document.querySelector(".gate");
const form = document.querySelector(".signup");
const emailField = document.getElementById("email");
const submitButton = form.querySelector("button");
const errorText = document.querySelector(".error");
const announce = document.querySelector(".announce");
const tapButton = document.querySelector(".tap");

let current = null; // the film that should be playing

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function whenVisible() {
  return new Promise((resolve) => {
    if (!document.hidden) return resolve();
    document.addEventListener("visibilitychange", function check() {
      if (document.hidden) return;
      document.removeEventListener("visibilitychange", check);
      resolve();
    });
  });
}

/* ---------- Loading ---------- */

// Upright screens get a centre crop: same picture on screen, far fewer bytes.
const shape = matchMedia("(max-aspect-ratio: 3/4)").matches ? "tall" : "wide";

function startsLight() {
  const net = navigator.connection; // not in Safari, hence the SLOW_AFTER check too
  return Boolean(net && (net.saveData || /2g|3g/.test(net.effectiveType)));
}

async function download(name) {
  let light = startsLight();
  let tries = 0;

  while (tries < MAX_TRIES) {
    const url = `assets/web/${shape}${light ? "-lite" : ""}/${name}.mp4`;
    const controller = new AbortController();
    let received = 0;
    let total = 0;
    let switching = false;

    const slowCheck = light
      ? null
      : setTimeout(() => {
          if (total && received / total >= 0.4) return;
          switching = true;
          controller.abort();
        }, SLOW_AFTER);
    let silence = setTimeout(() => controller.abort(), NO_DATA_TIMEOUT);

    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`${response.status} ${url}`);
      total = Number(response.headers.get("content-length"));

      const reader = response.body.getReader();
      const chunks = [];
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        clearTimeout(silence);
        silence = setTimeout(() => controller.abort(), NO_DATA_TIMEOUT);
      }
      return URL.createObjectURL(new Blob(chunks, { type: "video/mp4" }));
    } catch (error) {
      light = true;
      if (!switching) {
        // While offline, wait on the logo without using up the tries.
        if (navigator.onLine) tries++;
        await wait(1000 * Math.max(tries, 1));
      }
    } finally {
      clearTimeout(slowCheck);
      clearTimeout(silence);
    }
  }
  return null;
}

async function prepare(film) {
  const name = film.dataset.film;
  // Opened by double-clicking index.html, fetch isn't allowed: use the file directly.
  const src =
    location.protocol === "file:"
      ? `assets/web/${shape}/${name}.mp4`
      : await download(name);
  if (!src) return;

  film.muted = true; // Safari checks the property, not just the attribute
  film.preload = "auto";
  film.src = src;
  film.load();
}

/* ---------- Playing ---------- */

function resume() {
  if (!current || current.ended || document.hidden) return;
  current.play().catch((error) => {
    if (error.name === "NotAllowedError") tapButton.hidden = false;
  });
}

// iOS grants playback per video and only during a tap, so touch each one.
function unlock(video) {
  if (video === current || !video.getAttribute("src")) return;
  video.play().catch(() => {});
  video.pause();
}

tapButton.addEventListener("click", () => {
  tapButton.hidden = true;
  films.forEach(unlock);
  resume();
});

document.addEventListener("visibilitychange", resume);

function reveal(film) {
  for (const other of films) {
    if (other === film) continue;
    const wasOn = other.classList.contains("on");
    other.classList.remove("on");
    other.classList.toggle("under", wasOn);
  }
  film.classList.remove("under");
  film.classList.add("on");
}

// Plays one film, reporting (time, duration) in ms. Resolves when it is over.
function play(film, onTime = () => {}) {
  current = film;

  return new Promise((resolve) => {
    let finished = false;
    let lastTime = -1;
    let still = 0; // how long the picture hasn't moved
    let blackTime = 0; // stands in for the film's clock if it couldn't load
    const broken = !film.getAttribute("src") || Boolean(film.error);

    function finish() {
      if (finished) return;
      finished = true;
      clearInterval(clock);
      resolve();
    }

    // Driven by the film's own clock, so text stays in step if playback pauses.
    const clock = setInterval(() => {
      if (document.hidden || !tapButton.hidden) return;

      if (broken) {
        blackTime += 100;
        onTime(blackTime, 4000);
        if (blackTime >= 4000) finish();
        return;
      }

      const time = film.currentTime;
      if (time > 0) onTime(time * 1000, film.duration * 1000);

      still = time === lastTime ? still + 100 : 0;
      lastTime = time;
      if (film.ended || film.error || still >= FROZEN_AFTER) finish();
      else if (still && still % 1000 === 0) resume();
    }, 100);

    if (broken) {
      films.forEach((other) => other.classList.remove("on", "under"));
      return;
    }

    film.addEventListener("playing", () => reveal(film), { once: true });
    film.addEventListener("ended", finish, { once: true });
    film.currentTime = 0;
    resume();
  });
}

async function playWithLine(film) {
  const line = document.querySelector(`.line[data-for="${film.dataset.film}"]`);
  announce.textContent = line.textContent;

  await play(film, (time, duration) => {
    const show = time >= TEXT_IN_AT && time < duration - TEXT_OUT_BEFORE_END;
    line.classList.toggle("show", show);
  });
  line.classList.remove("show");
}

/* ---------- The void ---------- */

function showGate() {
  if (gate.classList.contains("show")) return;
  gate.classList.add("show");
  announce.textContent = "";
  // On phones, focusing would throw the keyboard over the film.
  if (matchMedia("(pointer: fine)").matches) emailField.focus();
}

function fitGateToKeyboard() {
  const view = window.visualViewport;
  gate.style.setProperty("--view-top", `${view.offsetTop}px`);
  gate.style.setProperty("--view-height", `${view.height}px`);
}

// The grain is drawn in pixels, so it has to grow with the title.
function fitGrain() {
  const size = parseFloat(getComputedStyle(title).fontSize);
  grain.setAttribute("scale", Math.max(1.5, size * 0.045).toFixed(1));
}
fitGrain();
addEventListener("resize", fitGrain);

if (window.visualViewport) {
  visualViewport.addEventListener("resize", fitGateToKeyboard);
  visualViewport.addEventListener("scroll", fitGateToKeyboard);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (submitButton.disabled) return;

  unlock(filmFlower); // has to happen during the tap, before waiting on Brevo
  submitButton.disabled = true;
  form.classList.add("sending");
  errorText.textContent = "";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SIGNUP_TIMEOUT);

  try {
    const response = await fetch(form.action, {
      method: "POST",
      body: new FormData(form),
      signal: controller.signal,
    });
    const reply = await response.json();

    if (reply.success) {
      emailField.blur(); // closes the phone keyboard
      gate.classList.remove("show");
      announce.textContent = thanks.textContent.replace(/\s+/g, " ").trim();
      play(filmFlower, (time) => {
        if (time >= THANKS_IN_AT) thanks.classList.add("show");
      }); // rests on its last frame
      return; // the button stays disabled: one signup per visit
    }
    errorText.textContent =
      reply.message || "Something went wrong. Please try again.";
  } catch (error) {
    // Network down, timed out, or Brevo replied with something that isn't JSON.
    errorText.textContent = "Something went wrong. Please try again.";
  } finally {
    clearTimeout(timeout);
  }
  submitButton.disabled = false;
  form.classList.remove("sending");
});

/* ---------- The sequence ---------- */

async function start() {
  const ready = Promise.all(films.map(prepare));
  const font = document.fonts.load('300 1em "Aspekta"').catch(() => {});

  await logo.decode().catch(() => {});
  await whenVisible();
  logo.classList.add("show");

  await Promise.all([ready, font, wait(LOGO_FADE + LOGO_HOLD)]);
  await whenVisible();
  logo.classList.remove("show");
  await wait(LOGO_FADE);
  nav.classList.add("show");

  await playWithLine(film1);
  await playWithLine(film2);
  await playWithLine(film3);

  await play(filmVoid, (time) => {
    // Not if this is a late tick and the visitor has already moved on.
    if (time >= GATE_IN_AT && current === filmVoid) showGate();
  });
  if (current === filmVoid) showGate(); // also covers a film that failed
}

start();
