'use strict';

/**
 * @author - jedwards
 * @date - September 2017
 */

// Load the required NPM modules
const BoxSDK = require('box-node-sdk');
const GoogleCloudVision = require('@google-cloud/vision');
const Unescape = require('unescape-js');

// An array of all the features we're requesting Google Cloud Vision to return
const features = [
	{
		type: GoogleCloudVision.v1.types.Feature.Type.LABEL_DETECTION
	},
	{
		type: GoogleCloudVision.v1.types.Feature.Type.DOCUMENT_TEXT_DETECTION
	},
]

// Set up access to the Google Cloud Vision API
const google_cloud_vision = new GoogleCloudVision({
	projectId: process.env.GCV_PROJECT_ID,
	credentials: {
		client_email: process.env.GCV_CLIENT_EMAIL,
		private_key: Unescape(process.env.GCV_PRIVATE_KEY)
	}
});

/**
 * exports.handler()
 *
 * This is the main function that the Lamba will call when invoked.
 *
 * Inputs:
 * (JSON) event - data from the event, including the payload of the webhook, that triggered this function call
 * (JSON) context - additional context information from the request (unused in this example)
 * (function) callback - the function to call back to once finished
 *
 * Outputs:
 * (void)
 */
exports.handler = (event, context, callback) => {
	var sdk = new BoxSDK({
		clientID: process.env.BOX_CLIENT_ID,
		clientSecret: process.env.BOX_CLIENT_SECRET,
		appAuth: {
			keyID: process.env.BOX_KEY_ID,
			privateKey: Unescape(process.env.BOX_PRIVATE_KEY),
			passphrase: process.env.BOX_PASSPHRASE
		},
	});

	var webhookData = JSON.parse(event.body);
	var userID = webhookData.source.owned_by.id;
	var fileID = webhookData.source.id;

	var client = sdk.getAppAuthClient('user', userID);
	getAnnotations(client, fileID, (error, annotationImageResponse) => {
		saveMetadata(client, fileID, getMetadataValueForLabelAnnotations(annotationImageResponse), 'box-skills-keywords-demo', callback);
	 	saveMetadata(client, fileID, getMetadataValueForFullTextAnnotations(annotationImageResponse), 'box-skills-transcripts-demo', callback);
    });
};

/**
 * getAnnotations()
 *
 * Helper function to pass the contents of the image file to the Google Cloud Vision API to grab the annotations that
 * can be found on the image.
 *
 * Inputs:
 * (Object) client - the Box API client that we will use to read in the file contents
 * (int) fileID - the ID of the image file to classify
 * (function) callback - the function to call back to once finished
 *
 * Output:
 * (void)
 */
const getAnnotations = (client, fileID, callback) => {
	client.files.getReadStream(fileID, null, (error, stream) => {
		if (error) {
			console.log(error);
			callback(error);
		}

		var buffer = new Buffer('', 'base64');
	    stream.on('data', (chunk) => {
	        buffer = Buffer.concat([buffer, chunk]);
	    });

	    stream.on('end', () => {
			var request = {
				image: { content : buffer },
				features: features
			};

			google_cloud_vision.annotateImage(request)
			.then(function(responses) {
				var annotationImageResponse = JSON.parse(JSON.stringify(responses[0]));
				callback(null, annotationImageResponse);
			})
			.catch(function(error) {
				console.log(error);
			});
		});
	});
}

/**
 * saveMetadata()
 *
 * Helper function to save the metadata back to the file on Box.
 *
 * Inputs:
 * (Object) client - the Box API client that we will use to read in the file contents
 * (int) fileID - the ID of the image file to classify
 * (string) metadataValue - the formatted metadata to save back to Box
 * (function) callback - the function to call back to once finished
 *
 * Output:
 * (void)
 */
const saveMetadata = (client, fileID, metadata, templateKey, callback) => {
	client.files.addMetadata(fileID, client.metadata.scopes.GLOBAL, templateKey, metadata, (error, result) => {
		if (error) {
			console.log(error);
			callback(error);
		} else {
			var response = {
	        	statusCode: 200,
	        	body: metadata
	    	}

	    	callback(null, response);
		}
	})
}

/**
 * getMetadataValueForLabelAnnotations()
 *
 * Helper function to format the label annotations found by the Google Cloud Vision API
 *
 * Input:
 * (JSON) annotationImageResponse - the classifications found by the Cloud Vision API in JSON format
 *
 * Output:
 * (JSON) - the formatted metadata for entity annotations
 */
const getMetadataValueForLabelAnnotations = (annotationImageResponse) => {
	var metadataValue = '';
	if (annotationImageResponse.hasOwnProperty('labelAnnotations')) {
		var annotation = annotationImageResponse['labelAnnotations'];
		if (annotation.length > 0) {
			for (var j = 0; j < annotation.length - 1; j++) {
				metadataValue += annotation[j].description
				metadataValue += ', ';
			}
			metadataValue += annotation[j].description;
		}
	}

	var metadata = {
		keywords: metadataValue
	}

	return metadata;
}

/**
 * getMetadataValueForFullTextAnnotations()
 *
 * Helper function to format the full text annotations found by the Google Cloud Vision API
 *
 * Input:
 * (JSON) annotationImageResponse - the classifications found by the Cloud Vision API in JSON format
 *
 * Output:
 * (JSON) - the formatted metadata for full text annotations
 */
const getMetadataValueForFullTextAnnotations = (annotationImageResponse) => {
	var metadataValue = '';
	if (annotationImageResponse.hasOwnProperty('fullTextAnnotation')) {
		var annotation = annotationImageResponse['fullTextAnnotation'];
		if (annotation && annotation.hasOwnProperty('text')) {
			metadataValue += annotation.text;
		}
	}

	var metadata = {
		transcripts: metadataValue
	}

	return metadata;
}
