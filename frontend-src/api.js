const PREFIX = "/";

const req = (url, options = {}) => {
  console.log("🚀 ~ req ~ options:", options)
  console.log("🚀 ~ req ~ url:", url)
  const { body } = options;
  console.log((PREFIX + url).replace(/\/\/$/, ""));

  return fetch((PREFIX + url).replace(/\/\/$/, ""), {
    ...options,
    body: body ? JSON.stringify(body) : null,
    headers: {
      ...options.headers,
      ...(body
        ? {
          "Content-Type": "application/json",
        }
        : null),
    },
  }).then((res) =>
    res.ok
      ? res.json()
      : res.text().then((message) => {
        throw new Error(message);
      })
  );
};

export const getNotes = ({ age, search, page } = {}) => {

  return req(`notes?age=${age}&search=${search}&page=${page}`);
};

export const createNote = (title, text) => {

  return req("notes/new", {
    method: "POST",
    body: {
      title,
      html: text,
    },
  });
};

export const getNote = (id) => {

  return req(`notes/${id}`);
};

export const archiveNote = (id) => {

  return req(`notes/${id}/archive`, {
    method: "PATCH",
    body: {
      isArchived: true,
    },
  });
};

export const unarchiveNote = (id) => {

  return req(`notes/${id}/archive`, {
    method: "PATCH",
    body: {
      isArchived: false,
    },
  });
};

export const editNote = (id, title, text) => {

  return req(`notes/${id}`, {
    method: "PATCH",
    body: {
      title,
      html: text,
    },
  });
};

export const deleteNote = (id) => {

  return req(`notes/${id}`, {
    method: "DELETE",
  });
};

export const deleteAllArchived = () => {

  return req("notes", {
    method: "DELETE",
    body: {
      archived: true,
    },
  });
};
export const notePdfUrl = (id) => {
  return `/download/${id}`;
};

