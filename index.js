let AWS      = require('aws-sdk')
  , execSync = require('child_process').execSync
  , fs       = require('fs')
;

class ElasticBeanstalkVersionTagger {
	constructor(region, applicationName) {
		this.applicationName = applicationName;
		this.elasticbeanstalk = new AWS.ElasticBeanstalk({ apiVersion: '2010-12-01', region: region });
	}

	getCurrentApplicationVersionLabel() {
		let labelFile = __dirname + '/version_label.json';

		// Check for cached version label.
		if (fs.existsSync(labelFile)) {
			return require(labelFile);
		}
		else {
			if (!fs.existsSync('/var/log/eb-activity.log')) {
				return null;
			}
			
			// This command below only works before the application is restarted so we
			// will to cache the result.
			let cmd = 'tail /var/log/eb-activity.log | grep -i "\\[Application update .*\\] : Completed activity." | tail -1 | sed -E \'s/.*Application update (.*)@.*/\\1/\'';
			let result = execSync(cmd);
			let versionLabel = result.toString().trim();

			// Cache version label on disk.
			fs.writeFileSync(labelFile, JSON.stringify(versionLabel));

			return versionLabel;
		}
	}

	// options: {
	//    tagsToAdd: <object> (key-value pair)
	//    versionLabel: <string>
	// }
	tagApplicationVersion(options) {
		let tags = [];

		for (let i in options.tagsToAdd) {
			tags.push({ Key: i, Value: options.tagsToAdd[i] });
		}

		return new Promise((resolve, reject) => {
			this.getApplicationVersions({ versionLabels: [options.versionLabel], single: true })
				.then(applicationVersion => {
					let params = {
						ResourceArn: applicationVersion.ApplicationVersionArn,
						TagsToAdd: tags
					};

					this.elasticbeanstalk.updateTagsForResource(params, function(err, data) {
						if (err) {
							console.log(err, err.stack);

							reject(err);
						}

						resolve();
					});
				})
			;
		});
	}

	// If single is set to true, only the first element of versionLabels is used,
	// and only the first result is returned.
	//
	// options: {
	//    applicationName: <string>,
	//    versionLabels: <array>,
	//    single: <boolean>
	// }
	getApplicationVersions(options) {
		return new Promise((resolve, reject) => {
			let params = {
				ApplicationName: options.applicationName,
				VersionLabels: options.single ? [options.versionLabels[0]] : options.versionLabels
			};

			this.elasticbeanstalk.describeApplicationVersions(params, (err, data) => {
				if (err) {
					console.log(err, err.stack);

					return reject(err);
				}

				if (options.single && data.ApplicationVersions.length > 1) {
					console.log('Warning: More than one ApplicationVersions found with the specified version label (\'' + versionLabels[0] + '\')');
				}
			
				resolve(options.single ? data.ApplicationVersions[0] : data.ApplicationVersions);
			});
		});
	}

	// options: {
	//    versionLabel: <string>
	// }
	getApplicationVersionTags(options) {
		return new Promise((resolve, reject) => {
			this.getApplicationVersions({ versionLabels: [options.versionLabel], single: true })
				.then(applicationVersion => {
					let params = {
						ResourceArn: applicationVersion.ApplicationVersionArn,
					};

					this.elasticbeanstalk.listTagsForResource(params, function(err, data) {
						if (err) {
							console.log(err, err.stack);

							return reject(err);
						}

						let tags = {};
						for (let tag of data.ResourceTags) {
							tags[tag.Key] = tag.Value;
						}

						resolve(tags);
					});
				})
			;
		});
	}
}

module.exports = ElasticBeanstalkVersionTagger;