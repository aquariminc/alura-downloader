const fs = require("fs-extra");
const path = require("path");

const getPath = (paths = []) => {
  if (!Array.isArray(paths)) {
    paths = [paths]
  }
  const dir = path.join(...paths)
  fs.ensureDirSync(dir)
  return path.join(__dirname, dir)
}


function removeHTMLTags() {
  if(this.replaceAll)
    return this.replaceAll(/(<([^>]+)>)/ig, '')
  return this.replace(/(<([^>]+)>)/ig, '')
}

function removeNewLines() {
  if(this.replaceAll)
    return this.replaceAll('\n', '')
  return this.replace('\n', '')
}

function removeBlankSpace() {
  return this.trimStart().trimEnd()
}

String.prototype.removeHTMLTags = removeHTMLTags
String.prototype.removeNewLines = removeNewLines
String.prototype.removeBlankSpace = removeBlankSpace

module.exports = {
  getPath,
  removeHTMLTags,
  removeNewLines,
  removeBlankSpace
}

