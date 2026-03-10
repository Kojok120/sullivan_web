  gcloud コマンド一式（キーなし運用）

  # 0) 基本変数（必要に応じて書き換え）
  - PROJECT_ID="sullivan-prod-xxxx"
  - PROJECT_NAME="Sullivan Production"
  - BILLING_ACCOUNT_ID="000000-000000-000000"
  - REGION="asia-northeast1"

  # 組織/フォルダ配下の場合はどちらかを使用
  - ORG_ID="1234567890"
  - FOLDER_ID="1234567890"

  - RUNTIME_SA="sullivan-runtime"

  # 1) プロジェクト作成（ORG or FOLDER どちらか）
  gcloud projects create "$PROJECT_ID" --name="$PROJECT_NAME" --organization="$ORG_ID"
  # gcloud projects create "$PROJECT_ID" --name="$PROJECT_NAME" --folder="$FOLDER_ID"

  # 2) Billing 紐付け
  gcloud billing projects link "$PROJECT_ID" --billing-account "$BILLING_ACCOUNT_ID"

  # 3) gcloud 既定設定
  - gcloud config set project "$PROJECT_ID"
  - gcloud config set builds/region "$REGION"
  - gcloud config set run/region "$REGION"
  - gcloud config set run/platform managed

  # 4) 必要API有効化
  gcloud services enable \  
    run.googleapis.com \  
    cloudbuild.googleapis.com \  
    artifactregistry.googleapis.com \  
    secretmanager.googleapis.com \  
    iam.googleapis.com \  
    drive.googleapis.com

  # （任意）Cloud Scheduler を使う場合
  # gcloud services enable cloudscheduler.googleapis.com

  # 5) Cloud Run 実行用サービスアカウント作成
  gcloud iam service-accounts create "$RUNTIME_SA" \  
    --display-name="Sullivan Cloud Run runtime"  
  RUNTIME_SA_EMAIL="${RUNTIME_SA}@${PROJECT_ID}.iam.gserviceaccount.com"

  # 6) Drive API は Cloud Run 実行SAを使用（キー不要）
  #    Driveの対象フォルダを RUNTIME_SA_EMAIL に共有するだけでOK

  # 7) INTERNAL_API_SECRET を Secret Manager に登録
INTERNAL_API_SECRET="e75c5eb33d072af5f49cdbb5d77ddbc91123aa3d1bf23d914aead0df68cb252d"  
printf %s "$INTERNAL_API_SECRET" | gcloud secrets create internal-api-secret --replication-policy="automatic" --data-file=-

  # 8) Cloud Run 実行SAに Secret 参照権限を付与
  gcloud secrets add-iam-policy-binding internal-api-secret --member="serviceAccount:$RUNTIME_SA_EMAIL" --role="roles/secretmanager.secretAccessor"

# 8.1) Cloud Build のデフォルト実行SAに権限を付与

（deploy-grading-worker-*.sh の gcloud builds submit に必要）

  BUILD_SA="$(gcloud builds get-default-service-account --project "$PROJECT_ID")"
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$BUILD_SA" \
    --role="roles/storage.objectAdmin"
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$BUILD_SA" \
    --role="roles/artifactregistry.writer"

  # 9) （任意）Artifact Registry リポジトリを明示作成する場合
  # gcloud artifacts repositories create cloud-run-source-deploy --repository-format=docker --location="$REGION"

  手動作業（gcloud 以外）

  - Google Drive の採点フォルダを RUNTIME_SA_EMAIL に共有する（編集権限推奨）。
  - Cloud Run デプロイ時は --service-account "$RUNTIME_SA_EMAIL" を指定する。

  参照した公式ドキュメント

  - Cloud Run ソースデプロイ: https://docs.cloud.google.com/run/docs/deploying-source-
    code
  - Cloud Run シークレット: https://docs.cloud.google.com/run/docs/configuring/services/
    secrets
  - Cloud Run サービスアカウント: https://docs.cloud.google.com/run/docs/securing/service-identity
