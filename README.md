
PolyplexIDE
=====

概要
----
PolyplexIDEは、複数のLLMエージェントを組み合わせた開発支援IDEです。
タスクを分解し、計画・実装・レビュー・最適化を自律的に実行します。

主な機能
------
- **エージェントシステム**: 役割別のLLMエージェント（Planner, Implementer, Reviewer, Optimizer）
- **簡潔なプロンプト**: シンプルな入力で複雑なタスクを複数エージェントで処理
- **ワークフロー可視化**: 各ステップの進捗と結果をリアルタイム表示
- **承認フロー**: 生成されたコードをレビュー・承認・拒否
- **フィードバック学習**: 拒否時のフィードバックを次回の生成に活用

エージェント
------
### Planner
- タスクを分解し、実装計画を立案
- 簡潔で明確なステップに分解

### Implementer
- プランに基づいてコードを実装
- エッジケースとエラーハンドリングを含む

### Reviewer
- コードの品質を評価（正確性・品質・保守性）
- スコアリングと改善点の提示

### Optimizer
- コードを最適化（パフォーマンス・簡潔性）
- スコアが低い場合に自動起動

起動方法
------
1. 依存パッケージのインストール
	```bash
	npm install
	```

2. 環境変数の設定（.env）
	```
	OPENAI_API_KEY=your_openai_key
	GEMINI_API_KEY=your_gemini_key
	DEFAULT_PROVIDER=openai
	```

3. サーバ・フロントエンド同時起動
	```bash
	npm run dev:all
	```

使い方
------
1. プロンプト入力欄に実装したい機能を記述
2. 「実行」ボタンをクリック
3. エージェントが自動的にタスクを処理
4. 完了後、「承認」または「拒否」を選択
5. 拒否時はフィードバックを入力して再生成

構成
----
- `src/` : フロントエンド（React, Zustand, Tailwind）
- `server/` : バックエンド（Express, エージェントワークフロー）
- `server/db.json` : データ保存（タスク、エージェント、履歴）

技術スタック
------
- **フロントエンド**: React 19, TypeScript, Zustand, Tailwind CSS
- **バックエンド**: Express, Node.js
- **LLM**: OpenAI, Google Gemini, LM Studio対応
