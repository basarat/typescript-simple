/// <reference path="typings/node/node.d.ts" />
/// <reference path="node_modules/typescript/bin/typescript.d.ts" />

import fs = require('fs');
import os = require('os');
import path = require('path');

import ts = require('typescript');

var FILENAME_TS = 'file.ts';

function tss(code: string, options: ts.CompilerOptions): string {
    if (options) {
        return new tss.TypeScriptSimple(options).compile(code);
    } else {
        return defaultTss.compile(code);
    }
}

module tss {
    export class TypeScriptSimple {
        private service: ts.LanguageService = null;
        private outputs: ts.Map<string> = {};
        private options: ts.CompilerOptions;
        private files: ts.Map<{version: number; text: string;}> = {};

        /**
         * @param {ts.CompilerOptions=} options TypeScript compile options (some options are ignored)
         */
        constructor(options: ts.CompilerOptions = {}) {
            if (options.target == null) {
                options.target = ts.ScriptTarget.ES5;
            }
            if (options.module == null) {
                options.module = ts.ModuleKind.None;
            }
            this.options = options;
        }
    
        /**
         * @param {string} code TypeScript source code to compile
         * @return {string}
         */
        compile(code: string): string {
            if (!this.service) {
                this.service = this.createService();
            }

            var file = this.files[FILENAME_TS];
            file.text = code;
            file.version++;

            return this.toJavaScript(this.service);
        }

        private createService(): ts.LanguageService {
            var defaultLib = this.getDefaultLibFilename(this.options);
            var defaultLibPath = path.join(this.getTypeScriptBinDir(), defaultLib);
            this.files[defaultLib] = { version: 0, text: fs.readFileSync(defaultLibPath).toString() };
            this.files[FILENAME_TS] = { version: 0, text: '' };

            var servicesHost: ts.LanguageServiceHost = {
                getScriptFileNames: () => [this.getDefaultLibFilename(this.options), FILENAME_TS],
                getScriptVersion: (filename) => this.files[filename] && this.files[filename].version.toString(),
                getScriptSnapshot: (filename) => {
                    var file = this.files[filename];
                    return {
                        getText: (start, end) => file.text.substring(start, end),
                        getLength: () => file.text.length,
                        getLineStartPositions: () => [],
                        getChangeRange: (oldSnapshot) => undefined
                    };
                },
                getCurrentDirectory: () => process.cwd(),
                getScriptIsOpen: () => true,
                getCompilationSettings: () => this.options,
                getDefaultLibFilename: (options: ts.CompilerOptions) => {
                    return this.getDefaultLibFilename(options);
                },
                log: (message) => console.log(message),
                trace: (message) => console.debug(message),
                error: (message) => console.error(message)
            };

            return ts.createLanguageService(servicesHost, ts.createDocumentRegistry())
        }

        private getTypeScriptBinDir(): string {
            return path.dirname(require.resolve('typescript'));
        }

        private getDefaultLibFilename(options: ts.CompilerOptions): string {
            if (options.target === ts.ScriptTarget.ES6) {
                return 'lib.es6.d.ts';
            } else {
                return 'lib.d.ts';
            }
        }

        private toJavaScript(service: ts.LanguageService): string {
            var output = service.getEmitOutput(FILENAME_TS);
            if (output.emitOutputStatus === ts.EmitReturnStatus.Succeeded) {
                var filename = FILENAME_TS.replace(/ts$/, 'js');
                var file = output.outputFiles.filter((file) => file.name === filename)[0];
                // Fixed in v1.5 https://github.com/Microsoft/TypeScript/issues/1653
                return file.text.replace(/\r\n/g, os.EOL);
            }

            var allDiagnostics = service.getCompilerOptionsDiagnostics()
                .concat(service.getSyntacticDiagnostics(FILENAME_TS))
                .concat(service.getSemanticDiagnostics(FILENAME_TS));
            throw new Error(this.formatDiagnostics(allDiagnostics));
        }

        private formatDiagnostics(diagnostics: ts.Diagnostic[]): string {
            return diagnostics.map((d) => {
                if (d.file) {
                    return 'L' + d.file.getLineAndCharacterFromPosition(d.start).line + ': ' + d.messageText;
                } else {
                    return d.messageText;
                }
            }).join(os.EOL);
        }
    }
}

var defaultTss = new tss.TypeScriptSimple();

export = tss;
