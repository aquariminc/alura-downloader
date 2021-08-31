const {baseUrl} = require('./config')

const extractCourseTitle = async ({page}) => {
  return await page.evaluate(() => {
    const titleElement = document.querySelector('h1.course-header-banner-title strong')
    if (!titleElement) {
      return null
    }
    return titleElement.innerText
  })
}

const extractLessons = async ({page}) => {
  return await page.evaluate(({baseUrl}) => {
    const lessons = []
    document.querySelectorAll('li.courseSection-listItem').forEach(lessonContainerElement => {
      const link = lessonContainerElement.getElementsByTagName('a')[0].getAttribute("href")
      lessons.push({
        link: link ? baseUrl.concat(link) : null,
        title: lessonContainerElement.getElementsByClassName('courseSectionList-sectionTitle')[0].innerText,
      })
    })
    return lessons
  }, {baseUrl})
}

const extractText = async ({page}) => {
  return await page.evaluate(() => {
    return {
      type: 'text',
      content: document.getElementsByClassName("formattedText")[0].innerHTML
    }
  })
}

const extractQuestion = async ({page}) => {
  return await page.evaluate(() => {
    return {
      type: 'question',
      contentTitle: document.getElementsByClassName("formattedText")[0].innerHTML,
      content: document.getElementsByClassName("formattedText")[1].innerHTML
    }
  })
}

const extractSingleChoice = async ({page}) => {

  return await page.evaluate(() => {

    const alternatives = []
    const alternativeElements = Array.from(document.getElementsByClassName("alternativeList-item"))
    const singleChoiceTitle = document.getElementsByClassName("choiceable-title")[0]

    alternativeElements.forEach((element) => {

      const content = element.getElementsByClassName("alternativeList-item-alternative")[0]?.innerHTML
      const opinion = element.getElementsByClassName("alternativeList-item-alternativeOpinion")[0]?.innerHTML
      const correct = element.getAttribute("data-correct") === "true"

      alternatives.push({ content, opinion, correct })

    })

    return {
      type: 'single_choice',
      contentTitle: singleChoiceTitle?.innerHTML,
      content: alternatives
    }

  })
}

const extractVideoInformation = async ({page}) => {
  return await page.evaluate(() => {
    return {
      type: 'video',
      content: document.getElementsByClassName("formattedText")[0].innerHTML
    }
  })
}

const extractTasks = async ({page}) => {
  return await page.evaluate(({baseUrl}) => {

    const getTypeTaskByAnchorElement = (element) => {
      const elementClasses = element.classList
      switch (true) {
        case elementClasses.contains("task-menu-nav-item-link-HQ_EXPLANATION"):
          return 'text'
        case elementClasses.contains("task-menu-nav-item-link-OPEN_QUESTION"):
          return 'openQuestion'
        case elementClasses.contains("task-menu-nav-item-link-SINGLE_CHOICE"):
          return "singleChoice"
        case elementClasses.contains("task-menu-nav-item-link-VIDEO"):
          return 'video'
        default:
          return undefined
      }
    }

    const tasks = []
    document.querySelectorAll('.task-menu-nav-item ').forEach(taskContainerElement => {
      const firstAnchorElement = taskContainerElement.getElementsByTagName('a')[0]
      const link = firstAnchorElement.getAttribute("href")
      tasks.push({
        link: link ? baseUrl.concat(link) : null,
        title: taskContainerElement.getElementsByClassName('task-menu-nav-item-title')[0].innerText,
        type: getTypeTaskByAnchorElement(firstAnchorElement)
      })
    })
    return tasks
  }, {baseUrl})
}

module.exports = {
  extractLessons,
  extractTasks,
  extractCourseTitle,
  extractText,
  extractQuestion,
  extractSingleChoice,
  extractVideoInformation
}
