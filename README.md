
PolyplexIDE
=====

概要
----
PolyplexIDEは、AIによるコード生成・レビュー・自動オーケストレーションを備えた開発支援IDEです。LLMを活用し、タスク分解・検証・承認までを自律的に実行します。

主な機能
------
- プロンプト入力によるタスク生成
- XYZW軸に基づく自動オーケストレーション
- LLM（OpenAI, Gemini, LM Studio等）切替対応
- タスク分解・静的検証・自動承認
- 状態・進捗の可視化UI

起動方法
------
1. 依存パッケージのインストール
	npm install
2. サーバ・フロントエンド同時起動
	npm run dev:all
	（または、server/とsrc/を個別に起動）

構成
----
- src/ : フロントエンド（React, Zustand, Tailwind）
- server/ : バックエンド（Express, JSON DB, LLMルーティング）
- public/ : 静的ファイル

ライセンス
----
MIT
