/*
 * Signup without leaving the page.
 *
 * A plain form post to Brevo shows the visitor Brevo's raw reply
 * ({ success: true, message: ... }). Instead, this sends the form in the
 * background, reads that reply, and swaps the form for a share button.
 * If this script doesn't run, the form still posts the old way.
 */

// The link that gets shared. Change this if the site lives somewhere else.
var SHARE_URL = "https://shapeshifters.studio";

var form = document.querySelector(".signup");
var thanks = document.querySelector(".thanks");
var shareButton = document.querySelector(".share");
var statusText = document.querySelector(".status");
var submitButton = form.querySelector("button[type=submit]");

function showStatus(text, isError) {
  statusText.textContent = text;
  statusText.classList.toggle("is-error", isError);
}

form.addEventListener("submit", function (event) {
  event.preventDefault(); // stop the normal page change
  submitButton.disabled = true;
  showStatus("", false);

  fetch(form.action, { method: "POST", body: new FormData(form) })
    .then(function (response) {
      return response.json();
    })
    .then(function (reply) {
      if (reply.success) {
        form.hidden = true;
        thanks.hidden = false;
        showStatus(reply.message, false);
        shareButton.focus(); // keyboard users land on the next thing to do
        shareRightAway();
      } else {
        showStatus(reply.message || "Something went wrong. Please try again.", true);
      }
    })
    .catch(function () {
      // Network down, or Brevo replied with something that isn't JSON.
      showStatus("Something went wrong. Please try again.", true);
    })
    .finally(function () {
      submitButton.disabled = false;
    });
});

/*
 * Share button: phones open the system share sheet (Messages, WhatsApp,
 * email...). Desktops usually don't have one, so the link is copied
 * instead and the button says so.
 *
 * Browsers only offer the share sheet and the modern clipboard on https
 * pages, so copying falls back to an older method that also works on
 * http, and as a last resort the link is shown to copy by hand.
 */
function openShareSheet() {
  return navigator.share({ title: "Les Shapeshifters", url: SHARE_URL });
}

function copyLink() {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(SHARE_URL);
  }
  // Older method: put the link in an off-screen text field, select it, copy.
  return new Promise(function (resolve, reject) {
    var field = document.createElement("textarea");
    field.value = SHARE_URL;
    field.readOnly = true;
    field.className = "hidden";
    document.body.appendChild(field);
    field.select();
    field.setSelectionRange(0, SHARE_URL.length); // needed on iOS
    var copied = false;
    try {
      copied = document.execCommand("copy");
    } catch (error) {}
    field.remove();
    if (copied) resolve();
    else reject();
  });
}

shareButton.addEventListener("click", function () {
  if (navigator.share) {
    openShareSheet().catch(function () {
      // Cancelling the share sheet lands here; nothing to do.
    });
    return;
  }

  copyLink().then(
    function () {
      shareButton.textContent = "Link copied";
      showStatus("Paste it to whoever you'd like to invite.", false);
    },
    function () {
      showStatus(SHARE_URL, false);
    }
  );
});

// Phones: open the share sheet straight after signing up. Some browsers
// (Safari especially) only allow it straight after a tap and refuse here;
// the share button is still on screen for that case.
function shareRightAway() {
  var isPhone = window.matchMedia("(pointer: coarse)").matches;
  if (isPhone && navigator.share) {
    openShareSheet().catch(function () {});
  }
}
