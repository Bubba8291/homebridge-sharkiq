#!/bin/env node

/**
 * This scripts queries the npm registry to pull out the latest version for a given tag.
 */

const fs = require("fs");
const semver = require("semver");
const child_process = require("child_process");
const assert = require("assert");

const BRANCH_VERSION_PATTERN = /^([A-Za-z]*)-(\d+.\d+.\d+)$/

// Load the contents of the package.json file
const packageJSON = JSON.parse(fs.readFileSync("package.json", "utf8"));

let refArgument = process.argv[2];
let tagArgument = process.argv[3] || "latest";

if (refArgument == null) {
  console.error("ref argument is missing");
  console.error("Usage: npm-version-script.cjs <ref> [tag]");
  process.exit(1);
}

/**
 * Queries the NPM registry for the latest version for the provided tag.
 * @param tag The tag to query for.
 * @returns {string} Returns the version.
 */
function getTagVersionFromNpm(tag) {
  try {
    return child_process.execSync(`npm info ${packageJSON.name} version --tag="${tag}"`).toString("utf8").trim();
  } catch (e) {
    throw e;
  }
}

function desiredTargetVersion(ref) {
  // ref is a GitHub action ref string
  if (ref.startsWith("refs/pull/")) {
    throw Error("The version script was executed inside a PR!");
  }

  assert(ref.startsWith("refs/heads/"))
  let branchName = ref.slice("refs/heads/".length);

  let results = branchName.match(BRANCH_VERSION_PATTERN);
  if (results != null) {
    if (results[1] !== tagArgument) {
      console.warn(`The base branch name (${results[1]}) differs from the tag name ${tagArgument}`);
    }

    return results[2];
  }

  // legacy mode were we use the `betaVersion` property in the package.json
  if (branchName === "beta" && packageJSON.betaVersion) {
    return packageJSON.betaVersion
  }

  throw new Error("Malformed branch name for ref: " + ref + ". Can't derive the base version. Use a branch name like: beta-x.x.x!");
}

// derive the base version from the branch ref
const baseVersion = desiredTargetVersion(refArgument);

// query the npm registry for the latest version of the provided tag name
const latestReleasedVersion = getTagVersionFromNpm(tagArgument); // e.g. 0.7.0-beta.12
const latestReleaseBase = semver.inc(latestReleasedVersion, "patch"); // will produce 0.7.0 (removing the preid, needed for the equality check below)

let publishTag;
if (semver.eq(baseVersion, latestReleaseBase)) { // check if we are releasing another version for the latest beta
  publishTag = latestReleasedVersion; // set the current latest beta to be incremented
} else {
  publishTag = baseVersion; // start of with a new beta version
}

// save the package.json
packageJSON.version = publishTag;
fs.writeFileSync("package.json", JSON.stringify(packageJSON, null, 2));