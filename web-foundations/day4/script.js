// Live Character Counter and Dark Mode - script.js

// ----- 1. Select all the elements we need -----
const noteText = document.getElementById("note-text");
const charCount = document.getElementById("char-count");
const wordCount = document.getElementById("word-count");
const clearBtn = document.getElementById("clear-btn");
const themeToggle = document.getElementById("theme-toggle");

// The character limit and the point where we start warning the user
const MAX_CHARS = 200;
const WARNING_AT = 180;


// ----- 2. updateCounts() -----
// Updates both counters and the warning / over classes.
function updateCounts() {
  const text = noteText.value;

  // Characters: just the length of the text
  const chars = text.length;


  const trimmed = text.trim();
  const words = trimmed === "" ? 0 : trimmed.split(/\s+/).length;

  // Show the numbers
  charCount.textContent = `${chars} / ${MAX_CHARS} characters`;
  wordCount.textContent = `${words} words`;

  // Add the class when the condition is true, remove it when false
  charCount.classList.toggle("warning", chars > WARNING_AT);
  charCount.classList.toggle("over", chars > MAX_CHARS);
}


// ----- 3. saveDraft() and clearAll() -----
function saveDraft() {
  localStorage.setItem("draft", noteText.value);
}

// Empties the textarea, resets the counters and removes the saved draft
function clearAll() {
  noteText.value = "";
  localStorage.removeItem("draft");
  updateCounts();
  noteText.focus();
}


// ----- 4. Theme helpers -----
// The button shows the mode you will switch TO:
//   light theme showing -> button says "Dark mode"
//   dark theme showing  -> button says "Light mode"
function updateThemeButton() {
  if (document.body.classList.contains("dark")) {
    themeToggle.textContent = "Light mode";
  } else {
    themeToggle.textContent = "Dark mode";
  }
}

function toggleTheme() {
  // toggle() adds "dark" if it is missing, removes it if it is there
  document.body.classList.toggle("dark");

  // Remember the choice
  if (document.body.classList.contains("dark")) {
    localStorage.setItem("theme", "dark");
  } else {
    localStorage.setItem("theme", "light");
  }

  updateThemeButton();
}


// ----- 5. Event listeners -----
// Every time the user types (or pastes, or deletes), update and save
noteText.addEventListener("input", function () {
  updateCounts();
  saveDraft();
});

// Escape inside the textarea clears everything
noteText.addEventListener("keydown", function (event) {
  if (event.key === "Escape") {
    clearAll();
  }
});

clearBtn.addEventListener("click", clearAll);
themeToggle.addEventListener("click", toggleTheme);


// ----- 6. When the page loads -----
// Restore the saved draft (getItem gives null if nothing was saved)
const savedDraft = localStorage.getItem("draft");
if (savedDraft !== null) {
  noteText.value = savedDraft;
}

// Restore the saved theme
const savedTheme = localStorage.getItem("theme");
if (savedTheme === "dark") {
  document.body.classList.add("dark");
}
updateThemeButton();

// Finally, show the correct counts for the restored draft
updateCounts();