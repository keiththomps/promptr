import path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { Liquid } from 'liquidjs'
import RefactorService from './refactorService.js'
import { FileService } from './fileService.js'
import CliState from './cliState.js'
import Gpt4Service from './gpt4Service.js'

export default class PluginService {
  static async call(userInput) {
    const verbose = CliState.opts().verbose
    const mode = CliState.opts().mode
    const outputFile = CliState.opts().outputPath
    let prompt = userInput.toString().trim()

    let lastArg = CliState.args.slice(-1)[0]
    let context = await FileService.load(lastArg)
    let additionalContext = await this.getAdditionalContext()
    const __filename = fileURLToPath(import.meta.url)
    const __dirname = dirname(__filename)

    let templatePath = path.join(__dirname, 'template.txt')
    const userTemplate = CliState.opts().templatePath
    if (userTemplate) templatePath = userTemplate
    if (verbose) console.log(`Template path is: ${templatePath}`)
    
    prompt = await this.loadTemplate(prompt, context, additionalContext, templatePath)
    if (verbose) console.log(`Prompt: \n${prompt}\n\n`)
    
    if (CliState.opts().dryRun) {
      console.log(prompt)
      process.exit(0)
    }
    

    const output = await this.executeMode(mode, prompt, outputFile)
    if (outputFile) await FileService.write(output, outputFile)
    else console.log(output)
  }

  static async executeMode(mode, prompt, outputFile) {
    if (mode != "gpt3" && mode != "gpt4") {
      console.log(`Mode ${mode} is not supported`)
      process.exit(1)
    }
    if (mode === "gpt3") {
      return await RefactorService.call(prompt, outputFile)
    }
    if (mode === "gpt4") {
      return await Gpt4Service.call(prompt, outputFile)
    }
    console.log(`Mode "${mode}" is not supported`)
    exit(1)
  }

  static async loadTemplate(prompt, context, additionalContext, templatePath) {
    if (!await FileService.fileExists(templatePath)) {
      console.log(`Template file ${templatePath} does not exist`)
      process.exit(1)
    }
    const templateText = await FileService.load(templatePath)
    const engine = new Liquid()
    engine.registerFilter("jsonToObject", (json) => JSON.parse(json));
    const tpl = engine.parse(templateText)    
    const content = await engine.render(tpl, {
      additionalContext: additionalContext,
      context: context,
      prompt: prompt,
    })
    return content
  }

  static async getAdditionalContext() {
    let argsExceptLast = CliState.args.slice(0, -1)
    if (argsExceptLast.length === 0) return("")
    let additionalContext = ""
    for (let n = 0; n < argsExceptLast.length; n++) {
      const filename = argsExceptLast[n]
      let s = await FileService.load(path.join(process.cwd(), filename))
      additionalContext = additionalContext.concat(
        `File "${filename}" contents:\n${s}\n------------------\n\n`
      )
    }
    return additionalContext
  }
}