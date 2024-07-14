const express = require("express");
const markdown = require('markdown-it')();
const markdownpdf = require("markdown-pdf")
const fs = require('fs');
const path = require('path');


const router = express.Router();

const bodyParser = require("body-parser");
const { MongoClient, ObjectId } = require("mongodb");

const clientPromise = MongoClient.connect(process.env.DB_URI, {
  useUnifiedTopology: true,
  minPoolSize: 10,
});
router.use(express.json());

router.use(async (req, res, next) => {
  try {
    const client = await clientPromise;
    const db = client.db("skillNotes");
    req.db = db;
    next();
  } catch (error) {
    next(error);
  }
});

function checkAge(age) {
  const date = new Date()
  switch (age) {
    case '3months':
      date.setMonth(date.getMonth() - 3);
      return new Date(date)
    case 'alltime':
      return new Date(-8640000000000000)
    default:
      date.setMonth(date.getMonth() - 1);
      return new Date(date)

  }
}


const demoNote = {
  title: 'Demo',
  html: `**Bold**
*Italic*
# H1
## H2
### H3
#### H4
##### H5
###### H6
> Quote
* Generic list 1
* 2
* 3
* 4
* 5
1. Numbered List 1
2. 2
3. 3
4. 4
5. 5`
}



router.post("/notes/new", bodyParser.urlencoded({ extended: false }), async (req, res) => {
  const { title, html } = req.body;
  const text = markdown.render(html).toString()

  const note = await req.db.collection("notes").insertOne({ title, text: html, created: new Date(Date.now()), html: text, isArchived: false, userId: req.user._id });
  res.status(201).redirect(`/notes/${note.insertedId}`);

})

const highlightSearch = (text, search) => {
  if (!search) return text
  return text.replace(new RegExp(search, 'gi'), '<mark>$&</mark>')
}

router.get("/notes", async (req, res) => {
  const { page, search, age } = req.query

  if (req.user.isNew) {

    const text = markdown.render(demoNote.html).toString()

    await req.db.collection("notes").insertOne({
      title: demoNote.title,
      text: demoNote.html,
      html: text,
      userId: req.user._id,
      created: new Date(Date.now()),
      isArchived: false

    });
    await req.db.collection("users").updateOne({ _id: req.user._id }, { $set: { isNew: false } });
  }

  const notes = await req.db.collection("notes").find({
    $and: [
      {
        $or: [
          { title: { $regex: search, $options: "i" } },
          { text: { $regex: search, $options: "i" } },
          { html: { $regex: search, $options: "i" } },
        ]
      },
      {
        $or: [
          age === 'archive' ? { isArchived: true } : { created: { $gte: checkAge(age) }, isArchived: false }
        ]
      }
    ]
  }, { sort: { created: -1 } }).skip((+page - 1) * 20).limit(20).toArray();




  const hasMore = notes.length > 19

  if (!notes) {
    res.status(404).json([])
  }


  const result = notes.map(note => {
    return {
      ...note,
      highlights: highlightSearch(note.title, search)
    }
  })

  res.json({ notes: result, hasMore });

});


router.get("/notes/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const note = await req.db.collection("notes").findOne({ _id: new ObjectId(id) });
    if (!note) {
      res.status(404).json({ error: "Note not found" });
    }
    res.json(note);
  } catch (error) {
    console.error(error.message);
  }


});


router.patch("/notes/:id", bodyParser.urlencoded({ extended: false }), async (req, res) => {
  const { id } = req.params;
  if (req.error) {
    return res.status(403).json({ error: req.error.message });
  }
  try {
    const userNote = await req.db.collection("notes").findOne({ _id: new ObjectId(id) });
    if (userNote.userId.toString() !== req.user._id.toString()) {
      req.error = new Error("You can't edit this note");
      throw req.error;
    }

    const { title, html } = req.body;
    const text = markdown.render(html).toString()
    const note = await req.db.collection("notes").updateOne({ _id: new ObjectId(id) }, { $set: { title, text: html, html: text } });
    res.json(note);
  } catch (error) {
    res.status(403).json(error.message);
  }


})

router.patch("/notes/:id/archive", bodyParser.urlencoded({ extended: false }), async (req, res) => {
  const { id } = req.params;
  const { isArchived } = req.body;
  const note = await req.db.collection("notes").updateOne({ _id: new ObjectId(id) }, { $set: { isArchived } });
  res.json(note);
})

router.delete('/notes', async (req, res) => {
  const notes = await req.db.collection("notes").deleteMany({ isArchived: true });
  res.json(notes);
})

router.delete("/notes/:id", async (req, res) => {
  const { id } = req.params;
  const note = await req.db.collection("notes").deleteOne({ _id: new ObjectId(id) });
  res.json(note);
})

const createPdf = async (note) => {
  const publicDir = path.join(__dirname, 'public');
  const pdfPath = path.join(publicDir, `${note.title}.pdf`);

  return new Promise((resolve) => {
    markdownpdf().from.string(note.text).to(pdfPath, () => {
      resolve(pdfPath);
    });
  });
}

router.get('/download/:id', async (req, res) => {
  const { id } = req.params;
  const note = await req.db.collection("notes").findOne({ _id: new ObjectId(id) });
  if (!note) {
    return res.status(404).json({ error: "Note not found" });
  }

  try {
    const pdfPath = await createPdf(note);
    res.download(pdfPath, `${note.title}.pdf`, (err) => {
      if (err) {
        return res.status(500).json({ error: 'Error downloading file' });
      } else {
        fs.unlinkSync(pdfPath);
      }
    });
  } catch (error) {
    return res.status(500).json({ error: 'Error creating PDF' });
  }
});

router.get("/dashboard", (req, res) => {
  if (!req.user) {
    return res.redirect("/");
  }
  res.render("dashboard", { user: req.user });
})





module.exports = router;
