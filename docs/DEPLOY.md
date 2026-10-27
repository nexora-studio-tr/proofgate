# Demo deployment / Demo yayını

Published demo: [proofgate-demo.onrender.com](https://proofgate-demo.onrender.com/). Source: [nexora-studio-tr/proofgate](https://github.com/nexora-studio-tr/proofgate). The public deployment uses the Free plan and only the bundled reference data.

`Dockerfile.web` runs **only the read-only synthetic demo**. It does not start a supervisor, accept uploaded source or expose account creation. Do not add a Docker socket, private source mount or production credentials to this image. For real project/team verification use [self-hosted setup](SETUP.md).

## Local container

```sh
docker build --file Dockerfile.web --tag proofgate-web:0.1.0 .
docker run --rm -p 127.0.0.1:4328:10000 -e PUBLIC_URL=http://127.0.0.1:4328 proofgate-web:0.1.0
```

Open port 4328. `/healthz` reports the mode/version; every non-GET demo API action is forbidden. The displayed report is a recorded execution of the bundled synthetic permissions example, not a live check of visitor code.

## Free Render service

The included `render.yaml` declares one Docker web service on the **Free** plan, with no database or paid disk. Create the service from this public repository after its CI checks pass. The Dockerfile is `Dockerfile.web`; Render supplies `PORT` and `RENDER_EXTERNAL_URL`. For another provider set `PORT`, `LISTEN_HOST=0.0.0.0` and `PUBLIC_URL` to the exact public HTTPS origin.

Automatic deploys are off. Use **Deploy latest commit** only after checking CI for that commit. The public-repository URL flow does not need access to private GitHub repositories. Do not grant additional repository scopes just to deploy this public demo. No payment method is needed for the intended Free configuration; stop if a paid option becomes required.

Render Free can sleep after idle time, take about a minute to wake and discard local filesystem changes. This demo needs no durable visitor data. Workspace free-hours/build/bandwidth limits apply; this is not a promise of an always-on unlimited service. See [Render Free](https://render.com/docs/free) and [Blueprint specification](https://render.com/docs/blueprint-spec).

Türkçe: Blueprint yalnızca ücretsiz, salt okunur örnek demoyu kurar. Kendi kodunuzun canlı doğrulaması yerel/özel ekip kurulumunda yapılır. Genel demoya Docker soketi, özel kaynak veya hesap anahtarı eklemeyin. Ücretsiz hizmet boşta uyuyabilir; ilk açılış yaklaşık bir dakika sürebilir. CI geçtiğini görmeden yeni sürümü yayımlamayın. [Türkçe ekip kurulumu](SETUP.tr.md).
