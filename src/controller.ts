/* eslint-disable @typescript-eslint/naming-convention */
/*
   Copyright 2023 Bernhard Walter
  
   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at
  
      http://www.apache.org/licenses/LICENSE-2.0
  
   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/

import * as vscode from "vscode";
import { CadqueryViewer } from "./viewer";
import { template } from "./display";
import { createServer, IncomingMessage, Server, ServerResponse } from "http";
import * as output from "./output";
import { logo } from "./logo";
import { StatusManagerProvider } from "./statusManager";

var serverStarted = false;

export class CadqueryController {
    server: Server | undefined;
    statusController: StatusManagerProvider;
    view: vscode.Webview | undefined;
    port: number;
    viewer_message = "{}";
    splash: boolean = true;

    constructor(
        private context: vscode.ExtensionContext,
        port: number,
        statusController: StatusManagerProvider
    ) {
        this.port = port;
        this.statusController = statusController;

        if (!serverStarted) {
            if (this.startCommandServer(this.port)) {
                output.info("Starting web server ...");
                serverStarted = true;
                CadqueryViewer.createOrShow(this.context.extensionUri, this);
                let panel = CadqueryViewer.currentPanel;
                this.view = panel?.getView();
                if (this.view !== undefined) {
                    const stylePath = vscode.Uri.joinPath(this.context.extensionUri, "node_modules", "three-cad-viewer", "dist", "three-cad-viewer.css");
                    const scriptPath = vscode.Uri.joinPath(this.context.extensionUri, "node_modules", "three-cad-viewer", "dist", "three-cad-viewer.esm.js");
                    const styleSrc = this.view.asWebviewUri(stylePath);
                    const scriptSrc = this.view.asWebviewUri(scriptPath);
                    CadqueryViewer.currentPanel?.update(template(styleSrc, scriptSrc));

                    this.view.onDidReceiveMessage(
                        message => {
                            this.viewer_message = message;
                        });

                }
            }
        }
    }

    public isStarted(): boolean {
        return serverStarted;
    }

    public logo() {
        this.view?.postMessage(logo);
    }

    public config() {
        let options = vscode.workspace.getConfiguration("OcpCadViewer.view");
        let c: Record<string, any> = {
            "theme": options.get("dark") ? "dark" : "light",
            "tree_width": options.get("tree_width"),
            "control": options.get("orbit_control") ? "orbit" : "trackball",
            "up": options.get("up"),
            "glass": options.get("glass"),
            "tools": options.get("tools"),
            "rotate_speed": options.get("rotate_speed"),
            "zoom_speed": options.get("zoom_speed"),
            "pan_speed": options.get("pan_speed"),
            "axes": options.get("axes"),
            "axes0": options.get("axes0"),
            "black_edges": options.get("black_edges"),
            "grid": [options.get("grid_XY"), options.get("grid_XZ"), options.get("grid_YZ")],
            "collapse": options.get("collapse"),
            "ortho": options.get("ortho"),
            "ticks": options.get("ticks"),
            "default_opacity": options.get("default_opacity"),
            "transparent": options.get("transparent"),
        }
        options = vscode.workspace.getConfiguration("OcpCadViewer.render");
        c["angular_tolerance"] = options.get("angular_tolerance");
        c["deviation"] = options.get("deviation");
        c["default_color"] = options.get("default_color");
        c["default_edgecolor"] = options.get("default_edgecolor");
        c["ambient_intensity"] = options.get("ambient_intensity");
        c["direct_intensity"] = options.get("direct_intensity");
        c["_splash"] = this.splash;
        return c
    }

    public startCommandServer(port: number): boolean {
        this.server = createServer(
            (req: IncomingMessage, res: ServerResponse) => {
                let response = "";
                if (req.method === "GET") {
                    if (req.url == "/status") {
                        response = this.viewer_message;
                        res.writeHead(200, {
                            "Content-Length": response.length,
                            "Content-Type": "text/plain"
                        });
                        res.end(response);
                    } else if (req.url == "/config") {
                        response = JSON.stringify(this.config());
                        res.writeHead(200, {
                            "Content-Length": response.length,
                            "Content-Type": "text/plain"
                        });
                        res.end(response);
                    }
                } else if (req.method === "POST") {
                    var json = "";
                    req.on("data", (chunk: string) => {
                        json += chunk;
                    });

                    req.on("end", () => {
                        output.debug("Received a new model");
                        this.view?.postMessage(json);
                        output.debug("Posted model to view");
                        response = "done";
                        res.writeHead(201, { "Content-Type": "text/plain" });
                        res.end(response);
                        if (this.splash) { this.splash = false }
                    });
                }
            }
        );
        this.server.on("error", (error) => {
            let msg = "";
            if (error.message.indexOf("EADDRINUSE") > 0) {
                output.info(
                    `Port ${this.port} alread in use, please choose another port`
                );
            } else {
                vscode.window.showErrorMessage(`${error}`);
            }
        });
        this.server.on("listening", () => {
            output.info(
                `OCP CAD Viewer is initialized, command server is running on port ${this.port}`
            );
        });
        this.server.listen(port);
        return this.server.address() !== null;
    }

    public dispose() {
        output.debug("CadqueryController dispose");

        this.server?.close();
        serverStarted = false;
        output.info("Server is shut down");
        this.statusController.refresh("<none>");
    }
}
