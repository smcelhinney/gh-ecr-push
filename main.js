const { execSync } = require('child_process');
const core = require('@actions/core');

const AWS_ACCESS_KEY_ID = core.getInput('access-key-id', { required: true });
const AWS_SECRET_ACCESS_KEY = core.getInput('secret-access-key', { required: true });
let images = core.getInput('image', { required: true });
if (~images.indexOf(',')) {
  images = images.split(',')
} else {
  images = [images]
};

console.log(`images`, images)
const localImages = core.getInput('local-image') || images;
const awsRegion = core.getInput('region') || process.env.AWS_DEFAULT_REGION || 'us-east-1';
const direction = core.getInput('direction') || 'push';
const isSemver = core.getInput('is-semver');

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

const accountLoginPassword = `aws ecr get-login-password --region ${awsRegion}`;
const accountData = run(`aws sts get-caller-identity --output json`);
const awsAccountId = JSON.parse(accountData).Account;
const imageUrls = images.map(img => `https://${awsAccountId}.dkr.ecr.${awsRegion}.amazonaws.com/${img}`);
core.setOutput('imageUrls', imageUrls);

run(`${accountLoginPassword} | docker login --username AWS --password-stdin ${awsAccountId}.dkr.ecr.${awsRegion}.amazonaws.com`);

if (direction === 'push') {
  if (!isSemver) {
    for (const currentImg of images) {
      console.log(`Pushing local image ${currentImg} to ${awsAccountId}.dkr.ecr.${awsRegion}.amazonaws.com/${currentImg}`);
      run(`docker tag ${currentImg} ${awsAccountId}.dkr.ecr.${awsRegion}.amazonaws.com/${currentImg}`);
      run(`docker push ${awsAccountId}.dkr.ecr.${awsRegion}.amazonaws.com/${currentImg}`);
    }
  } else {
    const uris = [];
    for (const currentImg of localImages) {
      const [imageName, tag] = currentImg.split(':');
      // This is quite a simplistic check, could be improved
      const isSemverTag = ~tag.indexOf('.');
      if (isSemverTag) {
        const semverArray = currentImg.split(':')[1].split('.');
        const versions = semverArray.map((number, index) =>
          semverArray.slice(0, index + 1).join('.')
        );
        versions.forEach(version => {
          const uri = `${awsAccountId}.dkr.ecr.${awsRegion}.amazonaws.com/${imageName}:${version}`;
          uris.push(uri);
        });
      } else {
        uris.push(`${awsAccountId}.dkr.ecr.${awsRegion}.amazonaws.com/${imageName}:${tag}`)
      }
    }

    uris.forEach(uri => {
      console.log(`Pushing ${uri}`);
      run(`docker tag ${currentImg} ${uri}`);
      run(`docker push ${uri}`);
    })
  }
} else if (direction == 'pull') {
  console.log("Pulling ${awsAccountId}.dkr.ecr.${awsRegion}.amazonaws.com/${image} to ${localImage}");
  // Pull doesn't support multiple tags.
  run(`docker pull ${awsAccountId}.dkr.ecr.${awsRegion}.amazonaws.com/${image[0]}`);
  run(`docker tag ${awsAccountId}.dkr.ecr.${awsRegion}.amazonaws.com/${image[0]} ${localImage} `);
} else {
  throw new Error(`Unknown direction ${direction}`);
}
