const { execSync } = require('child_process');
const core = require('@actions/core');

// Get inputs
const AWS_ACCESS_KEY_ID = core.getInput('access-key-id', { required: true });
const AWS_SECRET_ACCESS_KEY = core.getInput('secret-access-key', { required: true });
const image = core.getInput('image', { required: true });
const remoteImageTags = core.getInput('remote-image-tags', { required: true }).split(',');
console.log(`remoteImageTags`, remoteImageTags)
console.log(`image`, image)
const localImage = core.getInput('local-image') || image;
const awsRegion = core.getInput('region') || process.env.AWS_DEFAULT_REGION || 'us-east-1';
const direction = core.getInput('direction') || 'push';
const isSemver = core.getInput('is-semver');

// Run function 
function run(cmd, options = {}) {
  if (!options.hide) {
    console.log(`$ ${cmd}`);
  }
  return execSync(cmd, {
    shell: '/bin/bash',
    encoding: 'utf-8',
    env: {
      ...process.env,
      AWS_ACCESS_KEY_ID,
      AWS_SECRET_ACCESS_KEY,
    },
  });
}

// Get AWS metadata
const accountLoginPassword = `aws ecr get-login-password --region ${awsRegion}`;
const accountData = run(`aws sts get-caller-identity --output json`);
const awsAccountId = JSON.parse(accountData).Account;
const ecrPrefix = `${awsAccountId}.dkr.ecr.${awsRegion}.amazonaws.com`;
const imageUrls = remoteImageTags.map(imageTag => `https://${ecrPrefix}/${imageTag}`);

// Output created image URLS (from tags)
core.setOutput('imageUrls', imageUrls);

// Docker login
run(`${accountLoginPassword} | docker login --username AWS --password-stdin ${ecrPrefix}`);

function pushImageTags() {
  if (!isSemver) {
    for (const tag of remoteImageTags) {
      console.log(`Pushing local image ${image} to ${ecrPrefix}/${tag}`);
      run(`docker tag ${tag} ${ecrPrefix}/${tag}`);
      run(`docker push ${ecrPrefix}/${tag}`);
    }
  } else {
    // const uris = [];
    // for (const currentImg of localImages) {
    //   const [imageName, tag] = currentImg.split(':');
    //   // This is quite a simplistic check, could be improved
    //   const isSemverTag = ~tag.indexOf('.');
    //   if (isSemverTag) {
    //     const semverArray = currentImg.split(':')[1].split('.');
    //     const versions = semverArray.map((number, index) =>
    //       semverArray.slice(0, index + 1).join('.')
    //     );
    //     versions.forEach(version => {
    //       const uri = `${ecrPrefix}/${imageName}:${version}`;
    //       uris.push(uri);
    //     });
    //   } else {
    //     uris.push(`${ecrPrefix}/${imageName}:${tag}`)
    //   }
    // }

    // uris.forEach(uri => {
    //   console.log(`Pushing ${uri}`);
    //   run(`docker tag ${currentImg} ${uri}`);
    //   run(`docker push ${uri}`);
    // })
  }
}

function pullImage() {
  console.log(`Pulling ${ecrPrefix}/${image} to ${localImage}`);
  // Pull doesn't support multiple tags.
  run(`docker pull ${ecrPrefix}/${image}`);
  run(`docker tag ${ecrPrefix}/${image} ${localImage} `);
}

// Execute action
if (direction === 'push') {
  pushImageTags()
} else if (direction == 'pull') {
  pullImage()
} else {
  throw new Error(`Unknown direction ${direction}`);
}
