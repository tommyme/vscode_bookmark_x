import * as path from "path";
import * as vscode from "vscode";
import {
  Event,
  EventEmitter,
  TreeDataProvider,
  TreeItem,
  TreeItemCollapsibleState,
  commands,
  tasks,
  workspace,
} from "vscode";
import { TREEVIEW_ITEM_CTX_TYPE_TASK } from "./constants";

export class TaskDataProvider implements TreeDataProvider<TaskTreeItem> {
  private changeEmitter = new EventEmitter<
    TaskTreeItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this.changeEmitter.event;
  constructor(private context: vscode.ExtensionContext) {}
  public refresh() {
    this.changeEmitter.fire();
  }

  getTreeItem(element: TaskTreeItem): TreeItem {
    return element;
  }

  getChildren(element: TaskTreeItem): Thenable<TaskTreeItem[]> {
    if (!element) {
      return Promise.resolve(this.get_all_workspaces());
    }
    return Promise.resolve(this.getAllContent(element));
  }

  public async get_all_workspaces(): Promise<TaskTreeItem[]> {
    let res: Array<TaskTreeItem> = [];
    let wsfolders = vscode.workspace.workspaceFolders;
    if (wsfolders) {
      wsfolders.forEach(folder => {
        let tvi = new TreeItem(folder.name, TreeItemCollapsibleState.Expanded) as TaskTreeItem;
        res.push(tvi);
      });
    }
    return res;
  }
  private async getAllContent(el: TreeItem): Promise<TaskTreeItem[]> {
    let wsf = vscode.workspace.workspaceFolders!.filter(wsf => wsf.name === el.label)[0];
    let allTasks: TaskTreeItem[] = [];
    let allConfigs: TaskTreeItem[] = [];
    if ("want to get tasks") {
        allTasks = await this.getAllTasks(wsf);
    } 
    if ("want to get launch") {
      // if (workspace.getConfiguration().get("QuickRunPanel.includeDebugConfigs")) {
      allConfigs = await this.getAllLaunchConfigs(wsf);
    }
    return allTasks.concat(allConfigs);
  }

  /**
     * Find all tasks, and filter on source
     */
  private async getAllTasks(wsf:  vscode.WorkspaceFolder): Promise<TaskTreeItem[]> {
    let taskElements: TaskTreeItem[] = [];
    let allTasks = await tasks.fetchTasks();
    allTasks.forEach((task) => {
      let taskSources = ['Workspace'];
      if (taskSources.some((value) => value === task.source)) {
        taskElements.push(
          new TaskTreeItem(task, TreeItemCollapsibleState.None, this.context, wsf)
        );
      }
    });
    return taskElements;
  }

  private getAllLaunchConfigs(wsf :  vscode.WorkspaceFolder): TaskTreeItem[] {
    let launchElements: TaskTreeItem[] = [];
    let launch = workspace.getConfiguration("launch", wsf);
    const config = launch.get("configurations") as Array<vscode.DebugConfiguration>;
    config.forEach((conf) => {
      launchElements.push(
        new TaskTreeItem(conf, TreeItemCollapsibleState.None, this.context, wsf)
      );
    });
    return launchElements;
  }
}

export class TaskTreeItem extends TreeItem {
  constructor(
    public readonly _task: vscode.Task | vscode.DebugConfiguration,
    public readonly collapsibleState: TreeItemCollapsibleState,
    private context: vscode.ExtensionContext,
    public readonly wsf: vscode.WorkspaceFolder
  ) {
    super(_task.name, collapsibleState);
    let args: vscode.Task | vscode.DebugConfiguration;
    if (this._task instanceof vscode.Task) {
      args = this._task;
      this.iconPath = new vscode.ThemeIcon("explorer-view-icon");
    } else {
      args = _task as vscode.DebugConfiguration;
      this.iconPath = new vscode.ThemeIcon("debug-start");
    }
    this.command = {
      title: "title",
      command: "bmx.quickrun.runItem",
      arguments: [args, wsf],
    };
    this.tooltip = this._task.name;
    this.contextValue = TREEVIEW_ITEM_CTX_TYPE_TASK;
  }
}
function run_xxx(task: TaskTreeItem | vscode.DebugConfiguration, wsf: vscode.WorkspaceFolder) {
  function runTask(task: vscode.Task) {
    tasks.executeTask(task);
  }

  function launchDebug(debugTask: vscode.DebugConfiguration) {
      vscode.debug.startDebugging(wsf, debugTask);
  }
  if  (task instanceof vscode.Task) {
      runTask(task);
  } else {
      launchDebug(task as vscode.DebugConfiguration);
  }
}
export class TaskTreeViewManager {
  static view: vscode.TreeView<TaskTreeItem>;
  static tprovider: TaskDataProvider;

  static refreshCallback() {
    // tprovider.refresh()
  }

  static async init(context: vscode.ExtensionContext) {
    // this.treeDataProviderByFile = this.controller.getTreeDataProviderByFile();
    // vscode.TreeViewOptions
    if (!this.view) {
      this.tprovider = new TaskDataProvider(context);
      let view = vscode.window.createTreeView<TaskTreeItem>("bmx_quickrun", {
        treeDataProvider: this.tprovider,
        // dragAndDropController: this.controller.tprovider,
        showCollapseAll: true,
        canSelectMany: true,
      });
      this.view = view;
    }
    commands.registerCommand('bmx.quickrun.refresh', () => this.tprovider.refresh());

    let disposable;
    disposable = commands.registerCommand('bmx.quickrun.runItem', (task: TaskTreeItem | vscode.DebugConfiguration, wsf: vscode.WorkspaceFolder) => run_xxx(task, wsf));
    context.subscriptions.push(disposable);
    disposable = commands.registerCommand('bmx.quickrun.openProgramFile', async (item: TaskTreeItem) => {
      // 需要是python的运行配置，然后需要用workspaceFolder 才能用，其他情况待测试
      let path = ((item._task as vscode.DebugConfiguration).program as string).replace("${workspaceFolder}", item.wsf.uri.path);
      let uri = vscode.Uri.file(path);
      try {
        let stat = await vscode.workspace.fs.stat(uri);
        // file exists, go to the file
        vscode.window.showTextDocument(uri);
      } catch (err) {
        console.error("文件不存在");
      }
    });
  }
}

