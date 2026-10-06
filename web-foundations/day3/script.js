//Notes toolkit - day 3 assignment

let notes = [
  { id: 1, text: "Buy milk and bread", category: "personal" },
  { id: 2, text: "finish the Day 3 assignment", category: "study" },
  { id: 3, text: "Email the project report to Grace", category: "work" },
  { id: 4, text: "Revise JavaScript arrays", category: "study" },
  { id: 5, text: "Call mum", category: "personal" }, 
];

//Categories a note is allowed to have
const validCategories = ["personal", "work", "study"];

//1. searchNotes(word) - returns an array of notes that contain the word in their text
function searchNotes(word) {
  const lowerWord = word.toLowerCase();

  return notes.filter((note) => {
    return note.text.toLowerCase().includes(lowerWord);
  });
}

//2. longestNote()
function longestNote() {
  if (notes.length === 0) {
    return null;
  }

  let longest = notes[0];
  for (const note of notes) {
    if (note.text.length > longest.text.length) {
      longest = note;
    }
  }

  return longest;
}

//3. countByCategory()
function countByCategory() {
  const counts = { personal: 0, work: 0, study: 0 };

  for (const note of notes) {
    counts[note.category] = (counts[note.category] || 0) + 1;
  }

  return counts;
}

//4. getSummary()
function getSummary() {
  const counts = countByCategory();
  const total = notes.length;
  const word = total === 1 ? "note" : "notes";

  const parts = [];
  for (const category in counts) {
    if (counts[category] > 0) {
      parts.push(`${counts[category]} ${category}`);
    }
  }

  if (parts.length === 0) {
    return `${total} ${word}.`;
  }

  return `${total} ${word}: ${parts.join(", ")}.`;
}

//5. isDuplicate(text)
function isDuplicate(text) {
  const cleaned = text.trim().toLowerCase();

  return notes.some((note) => {
    return note.text.trim().toLowerCase() === cleaned;
  });
}

//6. addNote(text, category)
function addNote(text, category) {
  if (typeof text !== "string") {
    console.log("Not added: the note text must be a string.");
    return false;
  }

  const cleanText = text.trim();
  if (cleanText.length < 1 || cleanText.length > 200) {
    console.log("Not added: the note must be 1 to 200 characters long");
    return false;
  }

  if (!validCategories.includes(category)) {
    console.log(`Not added: "${category}" is not a valid category (use personal, work or study).`);
    return false;
  }

  if (isDuplicate(cleanText)) {
    console.log("Not added: a note with the same text already exists.");
    return false;
  }

  const newId = notes.length === 0 ? 1 : notes[notes.length - 1].id + 1;
  notes.push({ id: newId, text: cleanText, category: category });
  return true;
}

//Tests
console.log("--- searchNotes ---");
console.log(searchNotes("JAVASCRIPT"));
console.log(searchNotes("the"));
console.log(searchNotes("zebra"));

// -----longestNote ---
console.log("--- longestNote ---");
console.log(longestNote());

const savedNotes = notes;
notes = [];
console.log(longestNote());
notes = savedNotes;

// --- countByCategory ---
console.log("--- countByCategory ---");
console.log(countByCategory());
notes = [];
console.log(countByCategory());
notes = savedNotes;

// --- getSummary ---
console.log("--- getSummary ---");
console.log(getSummary());
notes = [savedNotes[0]];
console.log(getSummary());
notes = savedNotes;

// --- isDuplicate ---
console.log("--- isDuplicate ---");
console.log(isDuplicate("Call mum"));
console.log(isDuplicate("  calL MUM   "));
console.log(isDuplicate("Buy eggs"));

// ----- addNote -----
console.log("--- addNote ---");
console.log(addNote("Pay the electricity bill", "personal"));
console.log(addNote("buy milk and bread", "personal"));
console.log(addNote("", "work"));
console.log(addNote("a".repeat(201), "work"));
console.log(addNote("Plan a weekend trip", "fun"));

console.log(getSummary());
