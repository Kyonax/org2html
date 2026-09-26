// A sample conversion-time plugin loaded via --plugin (test fixture).
export default {
  name: "sample",
  postProcessor: (html) => html + "<!-- sample-plugin -->",
}
