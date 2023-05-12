import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { encode } from "gpt-3-encoder"
import { FileService } from './fileService.js'
import CliState from '../cliState.js'
import OpenAiGptService from './OpenAiGptService.js'
import RefactorResultProcessor from './refactorResultProcessor.js'
import TemplateLoader from './templateLoaderService.js'
import PromptContext from './promptContext.js'
import { extractOperationsFromOutput } from './extractOperationsFromOutput.js'

export default class PluginService {
  
  static async call(userInput) {
    const verbose = CliState.verbose()
    const model = CliState.getModel()
    const outputFile = CliState.getOutputPath()
    let prompt = null
    if (CliState.getTemplatePath() === "refactor" && CliState.getOutputPath()) {
      console.log("The \"refactor\" template cannot be used with the --output option.")
      return 1
    }
    if (CliState.getModel() != "execute") {
      let context = await PromptContext.call(CliState.args)
      const __filename = fileURLToPath(import.meta.url)

      let templatePath = "refactor"
      const userTemplate = CliState.getTemplatePath()
      if (userTemplate) {
        templatePath = userTemplate
      }
      if (verbose) console.log(`Template path is: ${templatePath}`)
      
      prompt = await TemplateLoader.loadTemplate(userInput.toString().trim(), context, templatePath)
      
      if (CliState.isDryRun()) {
        console.log(prompt)
        console.log(`Prompt token count: ${encode(prompt).length}`)
        return
      }
    }
    
    const startTime = Date.now()
    const output = await this.executeMode(model, prompt)
    const endTime = Date.now()
    console.log(`Execution time: ${endTime - startTime}ms`)
    
    if (outputFile) {
      await FileService.write(output, outputFile)
      return 0
    }

    if (this.shouldRefactor(CliState.getTemplatePath())) {
      if (verbose) console.log(`Executing:\n${output}`)
      const operations = extractOperationsFromOutput(output)
      if (CliState.isDryRun()) {
        console.log(operations)
        return 0
      }
      await RefactorResultProcessor.call(operations)
      return 0
    }

    console.log(output)
    return 0
  }

  static async processPipedInput() {
    const pipedJson = await new Promise((resolve) => {
      process.stdin.once('data', resolve);
    });
    const operations = JSON.parse(pipedJson)
    return await RefactorResultProcessor.call(operations)
  }

  static async executeMode(model, prompt) {
    if (model != "gpt3" && model != "gpt4" && model != "execute") {
      console.log(`model ${model} is not supported`)
      process.exit(1)
    }
    if (model === "execute") {
      process.stdin.setEncoding('utf8')
      await this.processPipedInput()
      return "Changes applied"
    }
    
    const shouldRefactor = this.shouldRefactor(CliState.getTemplatePath())
    return await OpenAiGptService.call(prompt, model, shouldRefactor)
  }

  static shouldRefactor(templatePath) {
    if (CliState.getExecuteFlag()) return true
    return templatePath === "refactor" || !templatePath 
  }
}