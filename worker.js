import Bull from 'bull';
import { ObjectId } from 'mongodb';
import fs from 'fs';
import imageThumbnail from 'image-thumbnail';
import dbClient from './utils/db';

const fileQueue = new Bull('fileQueue');

fileQueue.process(async (job, done) => {
	const { userId, fileId } = job.data;
	console.log('in fileQueue process');
	if (!fileId) {
		done(new Error('Missing fileId'));
		return;
	}

	if (!userId) {
		done(new Error('Missing userId'));
		return;
	}

	const filesCollection = dbClient.db.collection('files');
	const file = await filesCollection.findOne({ _id: new ObjectId(fileId), userId: new ObjectId(userId) });

	if (!file) {
		done(new Error('File not found'));
		return;
	}

	const sizes = [500, 250, 100];
	try {
		for (const size of sizes) {
			const thumbnail = await imageThumbnail(file.localPath, { width: size });
			fs.writeFileSync(`${file.localPath}_${size}`, thumbnail);
			console.log(`Thumbnail for size ${size} created at ${thumbnailPath}`);
		}
		done();
	} catch (error) {
		done(error);
	}
});
