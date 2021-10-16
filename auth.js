require('dotenv').config()

const {baseUrl} = require('./config')
const _colors = require("cli-color");

const doLogin = async ({browser}) => {

  try {
    console.log('[ALURA LOGIN] - Authenticating')

    const page = await browser.newPage();
    await page.goto(`${baseUrl}/loginForm`);

    await page.type('#login-email', process.env.ALURA_USUARIO);
    await page.type('#password', process.env.ALURA_SENHA);

    await Promise.all([
      page.$eval('form.signin-form', form => form.submit()),
      page.waitForNavigation({waitUntil: 'networkidle0'}),
    ])

    const error = await page.evaluate(() => {
      let alertMessage = document.querySelector('.alert-message')
      return alertMessage ? alertMessage.innerText : null
    });

    console.log(`[ALURA LOGIN] - ${_colors.green('Authenticated')}`)

    await page.close()
  } catch (err) {
    console.log(
      `[ALURA LOGIN] - ${_colors.red('Failed, exiting..')}`
    )
    await browser.close();
  }
}

module.exports = {
  doLogin
}
