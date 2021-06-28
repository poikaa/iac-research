import * as fs from "fs";
import * as path from "path";
import * as mime from "mime";
import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

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

const lambdaRole = new aws.iam.Role("lambdaRole", {
  assumeRolePolicy: {
    Version: "2012-10-17",
    Statement: [
      {
        Action: "sts:AssumeRole",
        Principal: {
          Service: "lambda.amazonaws.com",
        },
        Effect: "Allow",
      },
    ],
  },
});

const lambdaRoleAttachment = new aws.iam.RolePolicyAttachment(
  "lambdaRoleAttachment",
  {
    role: lambdaRole,
    policyArn: aws.iam.ManagedPolicy.AWSLambdaBasicExecutionRole,
  }
);

const lambda = new aws.lambda.Function("lambdaFunction", {
  code: new pulumi.asset.AssetArchive({
    ".": new pulumi.asset.FileArchive("../app/api/hello"),
  }),
  runtime: "nodejs14.x",
  role: lambdaRole.arn,
  handler: "index.handler",
});

const apigw = new aws.apigatewayv2.Api("httpApiGateway", {
  protocolType: "HTTP",
});

const lambdaPermission = new aws.lambda.Permission(
  "lambdaPermission",
  {
    action: "lambda:InvokeFunction",
    principal: "apigateway.amazonaws.com",
    function: lambda,
    sourceArn: pulumi.interpolate`${apigw.executionArn}/*/*`,
  },
  { dependsOn: [apigw, lambda] }
);

const integration = new aws.apigatewayv2.Integration("lambdaIntegration", {
  apiId: apigw.id,
  integrationType: "AWS_PROXY",
  integrationUri: lambda.arn,
  integrationMethod: "GET",
});

const route = new aws.apigatewayv2.Route("apiRoute", {
  apiId: apigw.id,
  routeKey: "GET /api/hello",
  target: pulumi.interpolate`integrations/${integration.id}`,
});

const stage = new aws.apigatewayv2.Stage(
  "apiStage",
  {
    apiId: apigw.id,
    name: "$default",
    autoDeploy: true,
  },
  { dependsOn: [route] }
);

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
      {
        originId: apigw.id,
        domainName: pulumi
          .all([apigw.id, aws.getRegion()])
          .apply(
            ([apiId, region]) =>
              `${apiId}.execute-api.${region.id}.amazonaws.com`
          ),
        customOriginConfig: {
          httpPort: 80,
          httpsPort: 443,
          originProtocolPolicy: "https-only",
          originSslProtocols: ["TLSv1.2"],
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
    orderedCacheBehaviors: [
      {
        pathPattern: "/api/*",
        allowedMethods: ["GET", "HEAD"],
        cachedMethods: ["GET", "HEAD"],
        targetOriginId: apigw.id,
        viewerProtocolPolicy: "redirect-to-https",
        forwardedValues: {
          queryString: false,
          cookies: {
            forward: "none",
          },
        },
      },
    ],
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
