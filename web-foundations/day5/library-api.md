# Library API Design: Books

A REST API design for a library's **books** resource.

- **Base URL (example):** `https://api.library.example`
- **Data format:** JSON. Requests with a body send the header `Content-Type: application/json`.
- **Resource name:** `books` (a plural noun). The HTTP method says what to do, so the paths contain no verbs.

## The Book Object

Every book is stored and returned in this shape:

```json
{
  "id": 12,
  "title": "Things Fall Apart",
  "author": "Chinua Achebe",
  "year": 1958,
  "isbn": "978-0385474542"
}
```

- `id` is created by the server. The client never sends it when creating a book.
- `title` and `author` are required text.
- `year` is a number.
- `isbn` is a text identifier for the book.

## Endpoints at a Glance

- `GET /books` lists all books
- `GET /books/{id}` gets one book
- `POST /books` creates a book
- `PUT /books/{id}` updates a book
- `DELETE /books/{id}` deletes a book
- `GET /books?author={name}` lists the books by one author

## Endpoint Details

### 1. List all books

- **Method:** `GET`
- **Path:** `/books`
- **Description:** Returns an array of every book in the library.
- **Request body:** None
- **Success status code:** `200 OK`

### 2. Get one book

- **Method:** `GET`
- **Path:** `/books/{id}` (example: `/books/12`)
- **Description:** Returns the single book whose id matches the one in the path.
- **Request body:** None
- **Success status code:** `200 OK`

### 3. Create a book

- **Method:** `POST`
- **Path:** `/books`
- **Description:** Adds a new book and returns it, including the id the server gave it.
- **Request body:**

  ```json
  {
    "title": "Weep Not, Child",
    "author": "Ngugi wa Thiong'o",
    "year": 1964,
    "isbn": "978-0435908300"
  }
  ```

- **Success status code:** `201 Created`

### 4. Update a book

- **Method:** `PUT`
- **Path:** `/books/{id}` (example: `/books/12`)
- **Description:** Replaces the details of the book with that id. The body must contain all the fields.
- **Request body:**

  ```json
  {
    "title": "Things Fall Apart",
    "author": "Chinua Achebe",
    "year": 1959,
    "isbn": "978-0385474542"
  }
  ```

- **Success status code:** `200 OK`

### 5. Delete a book

- **Method:** `DELETE`
- **Path:** `/books/{id}` (example: `/books/12`)
- **Description:** Removes the book with that id from the library.
- **Request body:** None
- **Success status code:** `204 No Content` (the book is gone, so there is nothing to return)

### 6. List books by author

- **Method:** `GET`
- **Path:** `/books?author={name}` (example: `/books?author=Chinua%20Achebe`)
- **Description:** Returns only the books written by the author given in the query parameter.
- **Request body:** None
- **Success status code:** `200 OK`
- **Note:** If the author has no books, the server still answers `200 OK` with an empty array `[]`. A search with no results is not an error.

## Error Codes

### 400 Bad Request

- **Meaning:** The request itself is wrong or incomplete, so the server cannot process it. The client must fix the request.
- **When it happens:** A client sends `POST /books` without a `title`, or sends `"year": "nineteen fifty-eight"` where a number is expected.
- **Example response body:**

  ```json
  {
    "error": "Bad Request",
    "message": "The field 'title' is required."
  }
  ```

### 404 Not Found

- **Meaning:** The request is well formed, but the book it asks for does not exist.
- **When it happens:** A client sends `GET /books/9999` and no book has the id 9999. The same applies to `PUT /books/9999` and `DELETE /books/9999`.
- **Example response body:**

  ```json
  {
    "error": "Not Found",
    "message": "No book with id 9999 exists."
  }
  ```