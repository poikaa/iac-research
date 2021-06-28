import * as fs from "fs";
import * as path from "path";
import * as mime from "mime";
import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";

const websiteOAI = new aws.cloudfront.OriginAccessIdentity("PulumiWebsiteOAI");

const websiteBucket = new aws.s3.Bucket("iac-research-pulumi-130359");

new aws.s3.BucketPolicy("ReadDataAOI", {
  bucket: websiteBucket.id,
  policy: pulumi.all([websiteBucket.arn, websiteOAI.iamArn]).apply(
    ([bucketArn, oaiIamArn]) => `{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": "s3:GetObject",
        "Resource": "${bucketArn}/*",
        "Principal": { "AWS": "${oaiIamArn}" }
      }
    ]
  }`
  ),
});

const buildDir = path.join(__dirname, "../app/client/build");
const files = listAllFiles(buildDir);

for (const file of files) {
  const destinationName = file.replace(buildDir, "");
  new aws.s3.BucketObject(destinationName, {
    bucket: websiteBucket,
    source: new pulumi.asset.FileAsset(file),
    contentType: mime.getType(file) || undefined,
  });
}

const websiteDistribution = new aws.cloudfront.Distribution(
  "PulumiWebsiteDistribution",
  {
    enabled: true,
    origins: [
      {
        originId: websiteBucket.id,
        domainName: websiteBucket.bucketRegionalDomainName,
        s3OriginConfig: {
          originAccessIdentity: websiteOAI.cloudfrontAccessIdentityPath,
        },
      },
    ],
    defaultRootObject: "index.html",
    customErrorResponses: [
      {
        errorCode: 403,
        responseCode: 200,
        responsePagePath: "/index.html",
      },
      {
        errorCode: 404,
        responseCode: 200,
        responsePagePath: "/index.html",
      },
    ],
    defaultCacheBehavior: {
      allowedMethods: ["GET", "HEAD"],
      cachedMethods: ["GET", "HEAD"],
      targetOriginId: websiteBucket.id,
      viewerProtocolPolicy: "redirect-to-https",
      forwardedValues: {
        queryString: false,
        cookies: {
          forward: "none",
        },
      },
    },
    viewerCertificate: {
      cloudfrontDefaultCertificate: true,
    },
    restrictions: {
      geoRestriction: {
        restrictionType: "none",
      },
    },
  }
);

function listAllFiles(directory: string, locations: string[] = []) {
  const items = fs.readdirSync(directory, { withFileTypes: true });

  items.forEach((dirent) => {
    const fullPath = path.join(directory, dirent.name);
    if (dirent.isDirectory()) {
      listAllFiles(fullPath, locations);
    } else {
      locations.push(fullPath);
    }
  });

  return locations;
}
