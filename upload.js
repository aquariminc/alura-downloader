const puppeteer = require('puppeteer-extra')

const StealthPlugin = require('puppeteer-extra-plugin-stealth')
puppeteer.use(StealthPlugin())

const maxTitleLen = 99
const maxDescLen = 4999

const timeout = 60000
const height = 900
const width = 900

let browser, page

const uploadURL = 'https://www.youtube.com/upload'
const homePageURL = 'https://www.youtube.com'

module.exports.launchBrowser = launchBrowser
module.exports.login = login
module.exports.initialize = initialize
module.exports.uploadVideo = uploadVideo
module.exports.close = close

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


async function initialize(credentials, puppeteerLaunch) {
  await launchBrowser(puppeteerLaunch)

  try {
    await login(page, credentials)
  } catch (error) {
    console.error(error)
    console.log("Login failed trying again to login")
    await login(page, credentials)
  }
  // await changeHomePageLangIfNeeded(page)
}

async function close() {
  await browser?.close()
}

async function changeLoginPageLangIfNeeded(localPage) {

  const selectedLangSelector = '[aria-selected="true"]'
  try {
    await localPage.waitForSelector(selectedLangSelector)
  } catch (e) {
    throw new Error('Failed to find selected lang : ' + e.name)
  }


  const selectedLang = await localPage.evaluate(
    selectedLangSelector => document.querySelector(selectedLangSelector).innerText,
    selectedLangSelector
  )

  if (!selectedLang) {
    throw new Error('Failed to find selected lang : Empty text')
  }

  if (selectedLang.includes('English')) {
    return
  }

  await localPage.click(selectedLangSelector)

  await sleep(1000)

  const englishLangItemSelector = '[role="presentation"]:not([aria-hidden="true"])>[data-value="en-GB"]'

  try {
    await localPage.waitForSelector(englishLangItemSelector)
  } catch (e) {
    throw new Error('Failed to find english lang item : ' + e.name)
  }

  await localPage.click(englishLangItemSelector)

  await sleep(1000)
}

async function changeHomePageLangIfNeeded(localPage) {
  await localPage.goto(homePageURL)

  const avatarButtonSelector = 'button#avatar-btn'

  try {
    await localPage.waitForSelector(avatarButtonSelector)
  } catch (e) {
    throw new Error('Avatar button not found : ' + e.name)
  }

  await localPage.click(avatarButtonSelector)

  const langMenuItemSelector = 'yt-multi-page-menu-section-renderer+yt-multi-page-menu-section-renderer>#items>ytd-compact-link-renderer>a'
  try {
    await localPage.waitForSelector(langMenuItemSelector)
  } catch (e) {
    throw new Error('Lang menu item selector not found : ' + e.name)
  }

  const selectedLang = await localPage.evaluate(
    langMenuItemSelector => document.querySelector(langMenuItemSelector).innerText,
    langMenuItemSelector
  )

  if (!selectedLang) {
    throw new Error('Failed to find selected lang : Empty text')
  }

  if (selectedLang.includes('English')) {
    await localPage.goto(uploadURL)

    return
  }

  await localPage.click(langMenuItemSelector)

  const englishItemXPath = '//*[normalize-space(text())=\'English (UK)\']'

  try {
    await localPage.waitForXPath(englishItemXPath)
  } catch (e) {
    throw new Error('English item selector not found : ' + e.name)
  }

  await sleep(3000)

  await localPage.evaluate(
    englishItemXPath => document.evaluate(englishItemXPath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue.click(),
    englishItemXPath
  )

  await localPage.goto(uploadURL)
}

async function launchBrowser(puppeteerLaunch) {
  browser = await puppeteer.launch(puppeteerLaunch)
  page = await browser.newPage()
  await page.setDefaultTimeout(timeout)
  await page.setViewport({
    width: width,
    height: height
  })
}

async function login(localPage, credentials) {
  await localPage.goto(uploadURL)

  await changeLoginPageLangIfNeeded(localPage)

  const emailInputSelector = 'input[type="email"]'
  await localPage.waitForSelector(emailInputSelector)
  await localPage.type(emailInputSelector, credentials.email)
  await localPage.keyboard.press('Enter')
  await localPage.waitForNavigation({
    waitUntil: 'networkidle0'
  })

  const passwordInputSelector = 'input[type="password"]:not([aria-hidden="true"])'
  await localPage.waitForSelector(passwordInputSelector)
  await localPage.type(passwordInputSelector, credentials.pass)

  await localPage.keyboard.press('Enter')

  await localPage.waitForNavigation()

  try {
    const uploadPopupSelector = 'ytcp-uploads-dialog'
    await localPage.waitForSelector(uploadPopupSelector, {
      timeout: 60000
    })
  } catch (error) {
    console.error(error)
    await securityBypass(localPage, credentials.recoveryemail)
  }
}

async function securityBypass(localPage, recoveryemail) {
  try {
    const confirmRecoveryXPath = '//*[normalize-space(text())=\'Confirm your recovery email\']'
    await localPage.waitForXPath(confirmRecoveryXPath)

    const confirmRecoveryBtn = await localPage.$x(confirmRecoveryXPath)
    await localPage.evaluate(el => el.click(), confirmRecoveryBtn[0])
  } catch (error) {
    console.error(error)
  }


  const enterRecoveryXPath = '//*[normalize-space(text())=\'Enter recovery email address\']'
  await localPage.waitForXPath(enterRecoveryXPath)
  await localPage.focus('input[type="email"]')
  await localPage.type('input[type="email"]', recoveryemail)
  await localPage.keyboard.press('Enter')
  await localPage.waitForNavigation({
    waitUntil: 'networkidle0'
  })
  const selectBtnXPath = '//*[normalize-space(text())=\'Select files\']'
  await localPage.waitForXPath(selectBtnXPath)
}

async function uploadVideo(videoJSON) {

  const pathToFile = videoJSON.path

  const title = videoJSON.title
  const description = videoJSON.description
  const tags = videoJSON.tags
  const playlistName = videoJSON.playlist
  const thumb = videoJSON.thumbnail
  await page.evaluate(() => {
    window.onbeforeunload = null
  })

  await page.goto(uploadURL)

  const closeBtnXPath = '//*[normalize-space(text())=\'Close\']'
  const selectBtnXPath = '//*[normalize-space(text())=\'Select files\']'
  for (let i = 0; i < 2; i++) {
    try {
      await page.waitForXPath(selectBtnXPath)
      await page.waitForXPath(closeBtnXPath)
      break
    } catch (error) {
      const nextText = i === 0 ? ' trying again' : ' failed again'
      console.log('failed to find the select files button for chapter ', chapter, nextText)
      console.error(error)
      await page.evaluate(() => {
        window.onbeforeunload = null
      })
      await page.goto(uploadURL)
    }
  }
  const closeBtn = await page.$x(closeBtnXPath)
  await page.evaluate(el => {
    el.textContent = 'oldclosse'
  }, closeBtn[0])

  const selectBtn = await page.$x(selectBtnXPath)
  const [fileChooser] = await Promise.all([
    page.waitForFileChooser(),
    selectBtn[0].click()
  ])
  await fileChooser.accept([pathToFile])

  await page.waitForXPath('//*[contains(text(),"Upload complete")]', {
    timeout: 0
  })
  // await page.waitForXPath('//*[contains(text(),"Upload complete")]', {
  //   hidden: true,
  //   timeout: 0
  // })
  // if (thumb) {
  //   const [thumbChooser] = await Promise.all([
  //     page.waitForFileChooser(),
  //     await page.waitForSelector(`[class="remove-default-style style-scope ytcp-thumbnails-compact-editor-uploader"]`),
  //     await page.click(`[class="remove-default-style style-scope ytcp-thumbnails-compact-editor-uploader"]`)
  //   ])
  //   await thumbChooser.accept([thumb])
  // }

  await page.waitForFunction('document.querySelectorAll(\'[id="textbox"]\').length > 1')
  const textBoxes = await page.$x('//*[@id="textbox"]')
  await page.bringToFront()
  await textBoxes[0].focus()
  await sleep(1000)

  await textBoxes[0].type(title.substring(0, maxTitleLen))
  const childOption = await page.$x('//*[contains(text(),"No, it\'s")]')

  await childOption[0].click()
  const moreOption = await page.$x('//*[normalize-space(text())=\'Show more\']')
  await moreOption[0].click()
  const playlist = await page.$x('//*[normalize-space(text())=\'Select\']')
  let createplaylistdone
  if (playlistName) {
    for (let i = 0; i < 2; i++) {
      try {
        await page.evaluate(el => el.click(), playlist[0])
        await page.waitForSelector('#search-input')
        await page.focus(`#search-input`)
        await page.type(`#search-input`, playlistName)

        const playlistToSelectXPath = '//*[normalize-space(text())=\'' + playlistName + '\']'
        await page.waitForXPath(playlistToSelectXPath, {
          timeout: 10000
        })
        const playlistNameSelector = await page.$x(playlistToSelectXPath)
        await page.evaluate(el => el.click(), playlistNameSelector[0])
        createplaylistdone = await page.$x('//*[normalize-space(text())=\'Done\']')
        await page.evaluate(el => el.click(), createplaylistdone[0])
        break;
      } catch (error) {
        await page.evaluate(el => el.click(), playlist[0])
        const newPlaylistXPath = '//*[normalize-space(text())=\'New playlist\'] | //*[normalize-space(text())=\'Create playlist\']'
        await page.waitForXPath(newPlaylistXPath)
        const createplaylist = await page.$x(newPlaylistXPath)
        await page.evaluate(el => el.click(), createplaylist[0])
        await page.keyboard.type(' ' + playlistName.substring(0, 148))
        const createplaylistbtn = await page.$x('//*[normalize-space(text())=\'Create\']')
        await page.evaluate(el => el.click(), createplaylistbtn[1])
        createplaylistdone = await page.$x('//*[normalize-space(text())=\'Done\']')
        await page.evaluate(el => el.click(), createplaylistdone[0])
      }
    }
  }
  // if (tags) {
  //   await page.focus(`[aria-label="Tags"]`)
  //   await page.type(`[aria-label="Tags"]`, tags.join(', ').substring(0, 495) + ', ')
  // }

  const nextBtnXPath = '//*[normalize-space(text())=\'Next\']/parent::*[not(@disabled)]'
  await page.waitForXPath(nextBtnXPath)
  let next = await page.$x(nextBtnXPath)
  await next[0].click()
  await page.waitForXPath(nextBtnXPath)
  next = await page.$x(nextBtnXPath)
  await next[0].click()

  await page.waitForXPath(nextBtnXPath)
  next = await page.$x(nextBtnXPath)
  await next[0].click()

  const publishXPath = '//*[normalize-space(text())=\'Publish\']/parent::*[not(@disabled)] | //*[normalize-space(text())=\'Save\']/parent::*[not(@disabled)]'
  await page.waitForXPath(publishXPath)
  await page.waitForSelector('[href^="https://youtu.be"]')
  const uploadedLinkHandle = await page.$('[href^="https://youtu.be"]')

  let uploadedLink
  do {
    await sleep(500)
    uploadedLink = await page.evaluate(e => e.getAttribute('href'), uploadedLinkHandle)
  } while (uploadedLink === 'https://youtu.be/')

  let publish;
  for (let i = 0; i < 10; i++) {
    try {
      publish = await page.$x(publishXPath)
      await publish[0].click()
      break
    } catch (error) {
      await sleep(5000)
    }

  }
  try {
    await page.waitForXPath(closeBtnXPath)
  } catch (e) {
    throw new Error('Please make sure you set up your default video visibility correctly, you might have forgotten. More infos : https://github.com/fawazahmed0/youtube-uploader#youtube-setup');
  }

  return uploadedLink
}
