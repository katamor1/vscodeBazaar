# Bazaar SCM for VS Code

Bazaar の作業ツリーを VS Code のソース管理ビューから扱うためのローカル拡張です。Git に近い操作感で、状態確認、履歴、差分、blame、ブランチ、タグ、シェルブ、競合解決をまとめて扱えます。

## 機能

- Bazaar の変更をソース管理ビューに表示し、`コミット対象`、`変更`、`未追跡`、`競合` に分けて管理します。
- 疑似ステージング機能により、先にファイルをコミット対象へ入れ、明示的な Bazaar ファイルリストでコミットします。
- 未追跡ディレクトリを展開し、生成されたフォルダツリーもファイル単位で確認・追加できます。
- 作業ツリー差分、履歴差分、blame のコンテキスト操作を VS Code の差分エディターで開きます。
- ソース管理ビュー配下に `BAZAAR EXPLORE`、履歴、ブランチ、タグ、シェルブ、グラフの各ビューを追加します。
- `BAZAAR EXPLORE` は、状態、競合、直近履歴グラフ、ブランチ、シェルブ、タグ、Bazaar info を 1 つの GUI で視覚確認できます。
- ファイル履歴、履歴検索、コミット詳細、変更パス、リビジョン ID のコピー、指定リビジョンのファイル表示に対応します。
- カーソル行または選択範囲の blame 注釈を表示し、ホバーで詳細を確認できます。
- GitLens 風の blame コンテキスト操作として、前リビジョン、作業中ファイル、任意リビジョン、ブランチ、タグとの差分を開けます。
- シェルブのプレビュー、適用、保持したまま適用、削除に対応します。
- 競合ファイルをマージエディターで開く操作、こちら側/相手側/両方を使う解決操作、選択競合の解決、全競合の解決、Bazaar の pending merge 状態のクリアを提供します。
- ブランチ作成では単純なフォルダ名を入力し、通常は現在の作業ツリーの兄弟フォルダとしてブランチを作成します。ブランチ切替では、兄弟の作業ツリーブランチを検出した場合、現在のツリー内で `bzr switch` を実行せず、同じ VS Code ウィンドウでそのフォルダを開きます。
- `clean-tree`、`uncommit`、`break-lock` など危険な操作は、先にプレビューしてから実行します。
- ワークスペースや Bazaar ツリーがない場合でも、コマンド未登録エラーにせず、利用不可メッセージを表示して安全に劣化します。

## 必要条件

Bazaar CLI をインストールし、`bzr` として実行できるようにしてください。別のパスにある場合は `bazaar.cliPath` に実行ファイルパスを設定します。

この拡張は、開いているワークスペース内の 1 つの Bazaar ルートを対象にします。共有リポジトリは、現在のツリーから Bazaar が検出できる範囲でブランチ一覧と操作に対応します。

## コマンド

主なコマンド:

- `Bazaar: 更新`
- `Bazaar: BAZAAR EXPLORE を開く`
- `Bazaar: BAZAAR EXPLORE を更新`
- `Bazaar: コミット対象の変更をコミット`
- `Bazaar: Pull`
- `Bazaar: Push`
- `Bazaar: Pending Merge 状態をクリア`
- `Bazaar: 出力を開く`
- `Bazaar: ファイル履歴を表示`
- `Bazaar: Blame 表示を切り替え`
- `Bazaar: 現在行のコミットをクイック表示`
- `Bazaar: 前リビジョンとの差分を行で開く`
- `Bazaar: 作業中ファイルとの差分を行で開く`
- `Bazaar: 前リビジョンとの差分を開く`
- `Bazaar: リビジョンとの差分を開く...`
- `Bazaar: ブランチまたはタグとの差分を開く...`
- `Bazaar: 現在行のコミット詳細を調査`

ファイル、ブランチ、タグ、シェルブ、競合、履歴、グラフの多くの操作は、各ビューのタイトルボタンやコンテキストメニューからも実行できます。

## キーバインド

既定ショートカットは、よく使うエディター操作だけに絞っています。

| コマンド | Windows/Linux | macOS |
| --- | --- | --- |
| Blame 表示を切り替え | `Ctrl+Alt+B` | `Cmd+Alt+B` |
| 現在行のコミットをクイック表示 | `Ctrl+Alt+C` | `Cmd+Alt+C` |
| 前リビジョンとの差分を行で開く | `Ctrl+Alt+Shift+B` | `Cmd+Alt+Shift+B` |

すべての既定キーバインドは、ファイルエディターにフォーカスがある場合だけ有効です。

## 設定

- `bazaar.cliPath`: Bazaar コマンドライン実行ファイルのパス。
- `bazaar.history.limit`: 履歴ビュー、グラフビュー、`BAZAAR EXPLORE` で読み込む最大リビジョン数。
- `bazaar.history.includeMerged`: 履歴ビュー、グラフビュー、`BAZAAR EXPLORE` にマージ済みリビジョンを含めるか。
- `bazaar.unknown.expandDirectories`: 未追跡ディレクトリをソース管理ビューでファイル単位に展開するか。
- `bazaar.autoRefresh.enabled`: ワークスペース内のファイル変更後に Bazaar 状態を自動更新するか。
- `bazaar.autoRefresh.debounceMs`: 自動更新のデバウンス時間。
- `bazaar.blame.enabledFormat`: カーソル行または選択範囲の行末 blame 装飾形式。
- `bazaar.dangerousOperations.requireTypedConfirmation`: 破壊的操作の前に、確認フレーズの正確な入力を要求するか。

## 安全性と劣化動作

- Bazaar コマンドを実行する前にリビジョン入力を検証します。不正な履歴、グラフ、blame 操作は、無効なリビジョンを `bzr` に渡さず、短い警告で止めます。
- 履歴上のファイル内容は読み取り専用の仮想ドキュメントとして開きます。
- `clean-tree`、`uncommit`、`break-lock`、全変更の revert、全競合の解決、シェルブ削除などの危険な操作は確認ダイアログを使い、設定が有効なら確認フレーズの入力も要求します。
- Bazaar ツリーがない場合や Bazaar メタデータが壊れている場合は、修復を試みず、利用不可メッセージ、無効化された操作、出力チャンネルの診断へ安全に劣化します。

## ローカルインストール

ビルドとパッケージ作成:

```powershell
npm install
npm test
npm run compile
npm run package
```

生成された `.vsix` は、VS Code の `拡張機能: VSIX からのインストール...` からインストールします。

## 既知の制限

- Bazaar 本体が常に真実の情報源です。ローカルの `.bzr` メタデータが壊れている場合、この拡張は安全に劣化しますが Bazaar ツリーの修復は行いません。
- 拡張は、開いているワークスペース内の 1 つの Bazaar ルートを対象にします。
- `コミット対象` は拡張内のローカル状態であり、Bazaar のステージング領域ではありません。
- `BAZAAR EXPLORE` の履歴グラフは視覚確認用に直近リビジョンを最大 40 件まで表示します。完全な履歴確認には履歴ビューまたはグラフビューを使います。
- ブランチ検出は Bazaar メタデータ、現在の checkout の兄弟フォルダ、この拡張で作成したブランチルートを確認します。`Bazaar: ブランチを作成` は現在のワークスペース内に子フォルダを作らず、`Bazaar: ブランチを切り替え、または作業ツリーを開く` は別の作業ツリーブランチを検出した場合に VS Code ウィンドウをその場所へ移動し、lightweight checkout の切替先では `bzr switch` にフォールバックします。
- 行差分コマンドはファイル差分を開いて blame 対象行付近を表示します。行だけの専用差分 UI は実装していません。
- 統合テストは現在、拡張の起動とコマンド登録を確認しており、完全な UI クリック操作までは網羅していません。

## トラブルシューティング

- コマンド出力やフォールバック診断は `Bazaar: 出力を開く` で確認します。
- Bazaar が `PATH` にない場合は、`bazaar.cliPath` を設定してください。
- Bazaar 作業ツリーが有効ではないと表示される場合は、Bazaar checkout 内のフォルダを開くか、そのフォルダで `bzr root` が動くか確認してください。
- `Bazaar: Pull` でブランチ分岐が報告された場合、Bazaar は Git のような自動マージを行いません。この拡張は `親ブランチをマージ`、`未取得/未反映を表示`、`出力を開く` を提示します。`親ブランチをマージ` を選ぶと `bzr merge` を実行するので、必要に応じて競合を解決してからマージコミットしてください。
- マージ中のファイル変更を revert しても Bazaar が pending merge と認識し続ける場合は、`Bazaar: Pending Merge 状態をクリア` を実行してください。これは `bzr revert --forget-merges` を実行し、ファイル内容を変更せず pending merge の親情報を消します。ファイル変更と pending merge 状態の両方を中止したい場合は `Bazaar: すべての変更と Merge 状態を Revert` を使います。
- Bazaar の内部再帰エラーにより履歴やグラフを読み込めない場合、コマンド操作は無効化されるか、不正なリビジョンを `bzr` に渡す前に短い警告で止まります。
- 履歴ファイルの差分が空で開く場合は、その仮想ドキュメントで捕捉された `bzr cat -r` エラーを出力チャンネルで確認してください。

## 検証

リリース前の推奨チェック:

```powershell
npm run compile
npm test
npm run test:integration
npm audit --omit=dev
npm run package
```

`npm run package` は `prepackage` により `npm run compile`、`npm test`、`npm run test:integration`、`npm audit --omit=dev` を先に実行します。このローカル VSIX リリースラインでは、`npm run package` により `vscode-bazaar-0.2.9.vsix` が生成されます。

## 補足

Bazaar には Git の staged index がありません。`コミット対象` グループは拡張が管理する状態で、`bzr commit` に渡す明示的なファイルリストとして使われます。

`clean-tree`、`uncommit`、`break-lock`、全競合の解決、全変更の revert、シェルブ削除は、`bazaar.dangerousOperations.requireTypedConfirmation` が有効な場合、モーダル確認と入力確認で意図的に保護されています。
