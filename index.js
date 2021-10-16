const Puppeteer = require('puppeteer-extra');
const cliProgress = require('cli-progress');
const _colors = require("cli-color");
const fs = require('fs-extra')
const http = require('http')
const https = require('https')
const Path = require('path')
const axios = require('axios')
const courseList = require('./courseList.json')

const { chunkPromise, PromiseFlavor } = require('chunk-promise');

const {
    extractLessons,
    extractTasks,
    extractCourseTitle,
    extractText,
    extractQuestion,
    extractChoices,
    extractVideoInformation
} = require('./alura-scrapper')
const { getPath } = require('./helpers')
const { getPlaylist, downloadVideo, compileVideos } = require('./hls-download')
const { doLogin } = require('./auth')
const { initialize, uploadVideo, close } = require("./upload");

let initializedYoutubePuppeteer = false;
let args = process.argv.slice(2)

let courseUrl = args.find((s) => !s.startsWith('-'))
let continueAfter = false
let uploadVideos = args && (args.includes("--u") || args.includes("-upload"))
let skipCheck = args && (args.includes("--s") || args.includes("-skipcheck"))

if (courseUrl && !courseUrl.includes('https://')) {
    if (courseUrl.startsWith('+')) {
        continueAfter = true
        courseUrl = courseUrl.slice(1)
        console.log(`\n[ARGUMENTS] - ${_colors.yellow('Start point at ' + courseUrl)}\n`)
    } else courseUrl = `https://cursos.alura.com.br/course/${courseUrl}`
}

const getM3u8Url = async({ page, taskLink }) => {
    await page.goto(`${taskLink}/video`)
    const jsonContent = await page.evaluate(() => JSON.parse(document.querySelector("body").innerText));

    if (!jsonContent) {
        return null
    }

    return jsonContent[0].link
}

var latestTempPath = null
const deleteTmpDir = (tmpPath) => fs.rmdirSync(tmpPath, { recursive: true })

function download(url, dest) {
    const TIMEOUT = 30000
    const uri = new URL(url)
    if (!dest) {
        dest = basename(uri.pathname)
    }
    const pkg = url.toLowerCase().startsWith('https:') ? https : http

    return new Promise((resolve, reject) => {
        const request = pkg.get(uri.href).on('response', (res) => {
            if (res.statusCode === 200) {
                const file = fs.createWriteStream(dest, { flags: 'wx' })
                res
                    .on('end', () => {
                        file.end()
                            // console.log(`${uri.pathname} downloaded to: ${path}`)
                        resolve()
                    })
                    .on('error', (err) => {
                        file.destroy()
                        fs.unlink(dest, () => reject(err))
                    }).pipe(file)
            } else if (res.statusCode === 302 || res.statusCode === 301) {
                // Recursively follow redirects, only a 200 will resolve.
                download(res.headers.location, dest).then(() => resolve())
            } else {
                reject(new Error(`Download request failed, response status: ${res.statusCode} ${res.statusMessage}`))
            }
        })
        request.setTimeout(TIMEOUT, function() {
            request.abort()
            reject(new Error(`Request timeout after ${TIMEOUT / 1000.0}s`))
        })
    })
}


const downloadCourseImage = async({ slug, name }) => {
    const imagePath = Path.join(__dirname, process.env.OUTPUT_DIR, handleMSNameFolder(name), 'image.svg')
    if (await fs.pathExists(imagePath)) {
        console.log('[COURSE] - Found image.svg')
        return
    }
    console.log('[' + _colors.yellow('COURSE') + '] - Downloading logo')
    const imageUrl = `https://www.alura.com.br/assets/api/cursos/${slug}.svg`
    return await download(imageUrl, imagePath)
}

const handleMSNameFolder = (string) => {
    const regex = /[<>:"\/\\|?*\x00-\x1F]|^(?:aux|con|clock\$|nul|prn|com[1-9]|lpt[1-9])$/i;
    return string.replace(new RegExp(regex, "gm"), "")
}

const downloadVideos = async({ playlist, directory, tmpPath }) => {

    if (latestTempPath)
        deleteTmpDir(latestTempPath)

    latestTempPath = tmpPath

    const downloads = playlist.map((link, index) => {
        return () => downloadVideo(link, getPath(tmpPath) + `/file-${index}.ts`)
    })

    const progressBar = new cliProgress.SingleBar({
        format: 'Downloading video fragments |' + _colors.cyan('{bar}') + '| {percentage}% || {value}/{total} fragments',
        barCompleteChar: '\u2588',
        barIncompleteChar: '\u2591',
        hideCursor: true,
    });

    progressBar.start(downloads.length, 0)

    const concurrentSize = 10;

    const response = await chunkPromise(downloads, {
        concurrent: concurrentSize,
        promiseFlavor: PromiseFlavor.PromiseAll,
        promiseFlavor: PromiseFlavor.PromiseAllSettled,
        callback: async(chunkResults, index, allResults) =>
            progressBar.update((index + 1) * concurrentSize)
    })

    console.log(_colors.cyan('\n-> Video downloaded'))

    progressBar.stop()

    try {
        await compileVideos({
            files: response.map(file => file.value),
            output: `${directory}/video.mp4`
        })
    } catch (e) {
        console.log(`\n[FFMPEG] - ${_colors.yellow(courseTitle)} ${_colors.red('[ERROR]')}`)
    }

}

const createBrowser = async() => {
    return Puppeteer.launch({
        // headless: false,
        args: [
            '--start-maximized',
            '--window-size=1920,1080',
        ],
        defaultViewport: null,
    });
}

const uploadTask = async({ path, courseTitle, taskInfo, taskName }) => {

    if (!uploadVideos) return;

    if (!initializedYoutubePuppeteer) {

        console.log('[' + _colors.redBright('YOUTUBE') + '] - Authenticating')

        try {
            await initialize({ email: process.env.YOUTUBE_USUARIO, pass: process.env.YOUTUBE_SENHA }, {
                headless: false,
                ignoreHTTPSErrors: true
            })
            initializedYoutubePuppeteer = true
            console.log(`[${_colors.redBright('YOUTUBE')}] - ${_colors.green('Authenticated')}`)
        } catch (e) {
            console.log(`[${_colors.redBright('YOUTUBE')}] - ${_colors.red('Failed, exiting..')}`)
            console.error(e)
            return
        }
    }

    const pathFolderName = Path.basename(path)

    console.log(`\n[VIDEO_UPLOAD] - ${_colors.yellow(pathFolderName)} ${_colors.yellow('Starting upload')}`)

    const videoInfo = {
        path: Path.join(path, `video.mp4`),
        title: taskName,
        playlist: courseTitle,
        description: taskInfo ? taskInfo.content.removeHTMLTags().removeBlankSpace() : ""
    }

    try {
        taskInfo.videoUrl = await uploadVideo(videoInfo)
        await fs.writeJson(Path.join(path, `info.json`), taskInfo)
        console.log(`\n[VIDEO_UPLOAD] - ${_colors.yellow(courseTitle)} ${_colors.green('[UPLOADED - ' + taskInfo.videoUrl + ']')}`)
    } catch (e) {
        console.log(`\n[VIDEO_UPLOAD] - ${_colors.yellow(courseTitle)} ${_colors.red('[ERROR]')}`)
        console.log(e)
    }

}

const handleTask = async({ task, indexTask, page, tasks, courseTitle, indexLesson, lesson }) => {

    console.log(`\n[TASK ${indexTask + 1}/${tasks.length}] - Working ${_colors.yellow(task.title)}`)

    const taskName = handleMSNameFolder(`Atividade ${indexTask + 1} - ${task.title}`);

    const pathArr = [process.env.OUTPUT_DIR, courseTitle, `Aula ${indexLesson + 1} - ${lesson.title}`, taskName].map(str => handleMSNameFolder(str))
    const rawPath = Path.join(...pathArr)

    if (await fs.pathExists(Path.join(rawPath, `info.json`))) {

        const taskInfo = await fs.readJSON(Path.join(rawPath, `info.json`))

        if (!taskInfo.name) {
            taskInfo.name = task.title
            await fs.writeJson(`${directoryToSave}/info.json`, taskInfo);
        }

        if (taskInfo.type !== 'video') {
            console.log(`\n[TASK ${indexTask + 1}/${tasks.length}] - Skipping as it is not a video task..`)
            return;
        }

        if (!uploadVideos && await fs.pathExists(Path.join(rawPath, `video.mp4`))) {
            console.log(`\n[TASK ${indexTask + 1}/${tasks.length}] - Skipping as upload is not considered`)
            return;
        }

        if (taskInfo.videoUrl && taskInfo.videoUrl.includes('youtu.be')) {
            const videoId = taskInfo.videoUrl.split(".be/")[1]
            const verificationUrl = `https://www.googleapis.com/youtube/v3/videos?part=id&id=${videoId}&key=${process.env.YOUTUBE_API_KEY}`
            const axiosResponse = await axios.get(verificationUrl)

            if (axiosResponse.data.items.length > 0) {
                console.log(`\n[TASK ${indexTask + 1}/${tasks.length}] - Skipping as the video was already uploaded.`)
                return;
            } else await uploadTask({ path: rawPath, courseTitle, taskName, taskInfo })
        } else {
            await uploadTask({ path: rawPath, courseTitle, taskName, taskInfo })
        }

    }

    const directoryToSave = getPath(pathArr)

    await Promise.all([
        page.goto(task.link),
        page.waitForNavigation({ waitUntil: 'networkidle0' }),
    ])

    try {
        await page.$eval('button.transcription-toggle', button => button.click())
    } catch {}

    let taskInfo = { name: task.title }

    switch (task.type) {
        case 'text':
            console.log(`\n[TASK] [${_colors.yellow(task.title)}] ${_colors.blue('Text found')}`)
            Object.assign(taskInfo, await extractText({ page }))
            break;
        case 'multipleChoice':
        case 'singleChoice':
            console.log(`\n[TASK] [${_colors.yellow(task.title)}] ${_colors.blue('Single/Multiple choice found')}`)
            Object.assign(taskInfo, await extractChoices({ page }))
            break;
        case 'openQuestion':
            console.log(`\n[TASK] [${_colors.yellow(task.title)}] ${_colors.blue('Question found')}`)
            Object.assign(taskInfo, await extractQuestion({ page }))
            break;
        case 'video':
            const random = new Date().getTime()
            console.log(`\n[TASK] [${_colors.yellow(task.title)}] ${_colors.blue('Video found')}`)
            Object.assign(taskInfo, await extractVideoInformation({ page }))
            const playlist = await getPlaylist(await getM3u8Url({ page, taskLink: task.link }))
            await downloadVideos({
                playlist,
                directory: directoryToSave,
                fileName: taskName,
                tmpPath: `${random}`
            })
            break;
    }

    await fs.writeJson(`${directoryToSave}/info.json`, taskInfo);

    if (task.type === 'video')
        await uploadTask({ path: rawPath, courseTitle, taskName, taskInfo })

    console.log(`\n[TASK] - ${_colors.yellow(task.title)} ${_colors.green('[OK]')}`)

}

const downloadCourse = async(browser) => {
    try {

        const page = await browser.newPage();

        await page.goto(courseUrl);

        const courseSlug = courseUrl.slice("https://cursos.alura.com.br/course/".length).split('/')[0]

        const courseTitle = await extractCourseTitle({ page })

        console.log(`[COURSE] - Found ${_colors.yellow(courseTitle)}`)

        await downloadCourseImage({ slug: courseSlug, name: courseTitle })

        const lessons = await extractLessons({ page })

        console.log(`\n[LESSONS] - Found ${lessons.length} lessons`)

        for (const [indexLesson, lesson] of lessons.entries()) {
            await page.goto(lesson.link)
            const tasks = await extractTasks({ page })

            console.log(
                `\n[LESSON ${indexLesson + 1}/${lessons.length}] - Working ${_colors.yellow(lesson.title)}`,
                '\n',
                `\n[TASKS] - Found ${tasks.length} tasks`,
            )

            let indexTask = 0
            let tries = 0

            while (indexTask < tasks.length) {
                if (tries++ > 3) {
                    tries = 0
                    indexTask++
                    continue
                }
                try {
                    const task = tasks[indexTask]
                    await handleTask({ indexTask, task, page, tasks, courseTitle, indexLesson, lesson })
                    tries = 0
                    indexTask++
                } catch (e) {
                    console.error(e)
                    tries++
                }
            }

            console.log(`\n[LESSON] - ${_colors.yellow(lesson.title)} ${_colors.green('[OK]')}`)

        }

        console.log(
            _colors.green('Finished!')
        )

    } catch (err) {
        console.log(
            _colors.red(`[ERROR] \n ${err}`)
        )
    }
}

async function main() {

    const browser = await createBrowser()
    await doLogin({ browser })

    if (courseUrl && !continueAfter) {
        await downloadCourse(browser)
        await browser.close()
        await close()
        return;
    }

    let index = courseUrl ? courseList.findIndex(({ slug }) => slug === courseUrl) : 0

    for (; index < courseList.length; index++) {
        const course = courseList[index]
        courseUrl = `https://cursos.alura.com.br/course/${course.slug}`
        await downloadCourse(browser)
    }

    await browser.close()
    await close()

}

main()