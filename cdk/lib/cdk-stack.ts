import * as path from "path";
import * as cdk from "@aws-cdk/core";
import * as s3 from "@aws-cdk/aws-s3";
import * as s3deploy from "@aws-cdk/aws-s3-deployment";

export class CdkStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const websiteBucket = new s3.Bucket(this, "WebsiteBucket", {
      bucketName: "iac-research-cdk-130359",
      publicReadAccess: true,
      websiteIndexDocument: "index.html",
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    new s3deploy.BucketDeployment(this, "DeployWebsite", {
      sources: [
        s3deploy.Source.asset(path.join(__dirname, "../../app/client/build")),
      ],
      destinationBucket: websiteBucket,
    });

    new cdk.CfnOutput(this, "bucketWebsiteUrl", {
      value: websiteBucket.bucketWebsiteUrl,
    });
  }
}
