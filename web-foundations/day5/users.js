// Select Elements
const loadButton =document.querySelector("#load-users");
const filterInput = document.querySelector("#filter-input");
const statusText = document.querySelector("#status");
const usersList = document.querySelector("#users-list");


//Define Constants
const API_URL = "https://jsonplaceholder.typicode.com/users";

//Adding Array
let allUsers = [];

//
function renderUsers(list) {
  usersList.textContent = ""; // Empty's the List first

  for (const user of list) {
    const item = document.createElement("li");

    const name = document.createElement("strong");
    name.textContent = user.name;

    const email = document.createElement("div");
    email.textContent = `Email: ${user.email}`;

    const city = document.createElement("div");
    city.textContent = `City: ${user.address.city}`;

    const company = document.createElement("div");
    company.textContent = `Company: ${user.company.name}`;

    item.append(name, email, city, company);
    usersList.appendChild(item);
  }
}


// Apply filter - filters the array
function applyFilter() {
  if (allUsers.length === 0) {
    return;
  }

  const text = filterInput.value.trim().toLowerCase();

  const matches = allUsers.filter((user) => {
    return user.name.toLowerCase().includes(text);
  });

  renderUsers(matches);

// No match: so inside the list
  if (matches.length === 0) {
    const message = document.createElement("li");
    message.textContent = "No users found.";
    usersList.appendChild(message);
  }
}

// Function Start loadUsers()
async function loadUsers() {  //Asks the server for the users and reports
  allUsers = [];
  usersList.textContent = "";
  statusText.textContent = "Loading Users...";
  loadButton.disabled = true; // Blocks extra clicks


try {
  const response = await fetch(API_URL);  // sends a GET request and pauses the function

  if (!response.ok) {        //  Fetch condition is true for status codes 200 to 299
    throw new Error(`Status ${response.status}`);  // Raises an error straight to catch 
  }

  allUsers = await response.json(); // Turns the JSON text into an array
  applyFilter();  // draws users from the array
  statusText.textContent = `Loaded ${allUsers.length} users.`;
} 
catch (error) {  
  statusText.textContent = "Could not load users. Please try again."; // Runs any try fails
  console.error(error);
} 
finally {
  loadButton.disabled = false; // Runs whether it worked or failed
}
}

// Event Listener
loadButton.addEventListener("click", loadUsers);

//Filter listener
filterInput.addEventListener("input", applyFilter);
