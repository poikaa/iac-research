import * as path from "path";
import * as cdk from "@aws-cdk/core";
import * as s3 from "@aws-cdk/aws-s3";
import * as s3deploy from "@aws-cdk/aws-s3-deployment";
import * as lambda from "@aws-cdk/aws-lambda";
import * as apigw2 from "@aws-cdk/aws-apigatewayv2";
import { LambdaProxyIntegration } from "@aws-cdk/aws-apigatewayv2-integrations";
import * as cf from "@aws-cdk/aws-cloudfront";
import * as origins from "@aws-cdk/aws-cloudfront-origins";

export class CdkStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const websiteBucket = new s3.Bucket(this, "WebsiteBucket", {
      bucketName: "iac-research-cdk-130359",
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    new s3deploy.BucketDeployment(this, "DeployWebsite", {
      sources: [
        s3deploy.Source.asset(path.join(__dirname, "../../app/client/build")),
      ],
      destinationBucket: websiteBucket,
    });

    const helloHandler = new lambda.Function(this, "WebsiteHelloHandler", {
      runtime: lambda.Runtime.NODEJS_14_X,
      code: lambda.Code.fromAsset(path.join(__dirname, "../../app/api/hello")),
      handler: "index.handler",
      memorySize: 256,
      timeout: cdk.Duration.seconds(3),
    });

    const websiteApi = new apigw2.HttpApi(this, "WebsiteApi");

    websiteApi.addRoutes({
      path: "/api/hello",
      methods: [apigw2.HttpMethod.GET],
      integration: new LambdaProxyIntegration({ handler: helloHandler }),
    });

    const websiteDistribution = new cf.Distribution(
      this,
      "WebsiteDistribution",
      {
        defaultBehavior: {
          origin: new origins.S3Origin(websiteBucket),
          viewerProtocolPolicy: cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        },
        defaultRootObject: "index.html",
        errorResponses: [
          {
            httpStatus: 403,
            responseHttpStatus: 200,
            responsePagePath: "/index.html",
          },
          {
            httpStatus: 404,
            responseHttpStatus: 200,
            responsePagePath: "/index.html",
          },
        ],
      }
    );

    websiteDistribution.addBehavior(
      "/api/*",
      new origins.HttpOrigin(
        `${websiteApi.httpApiId}.execute-api.${this.region}.amazonaws.com`
      ),
      {
        allowedMethods: cf.AllowedMethods.ALLOW_ALL,
      }
    );

    new cdk.CfnOutput(this, "WebsiteDistributionDomainName", {
      value: websiteDistribution.domainName,
    });
  }
}
