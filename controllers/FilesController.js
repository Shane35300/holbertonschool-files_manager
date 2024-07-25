import sha1 from 'sha1';
import redisClient from '../utils/redis';
import dbClient from '../utils/db';
import { ObjectId } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import Queue from 'bull';

class FilesController {
	static async postUpload(req, res) {
		const token = req.headers['x-token'];

		if (!token) {
			return res.status(401).json({ error: 'Unauthorized111' });
		}
		const userId = await redisClient.get(`auth_${token}`);
		if (!userId) {
			return res.status(401).json({ error: 'Unauthorized222' });
		}
		const _id = new ObjectId(userId);
		const userColllection = dbClient.db.collection('users');
		const user = await userColllection.findOne({ _id });
		if (!user) {
			return res.status(401).json({ error: 'Unauthorized333' });
		}
		const { name, type, parentId, isPublic, data } = req.body;
		const typesList = ['folder', 'file', 'image'];
		if (!name) {
			return res.status(400).json({ error: 'Missing name' });
		}
		if (!type || !typesList.includes(type)) {
			return res.status(400).json({ error: 'Missing type' });
		}
		if (!data && type !== 'folder') {
			return res.status(400).json({ error: 'Missing data' });
		}
		if (parentId) {
			const parentIdObjectId = new ObjectId(parentId);
			const filesColllection = dbClient.db.collection('files');
			const parent = await filesColllection.findOne({ _id: parentIdObjectId });
			if (!parent) {
				return res.status(400).JSON({ error: 'Parent not found' });
			}
			if (parent.type !== 'folder') {
				return res.status(400).json({ error: 'Parent is not a folder' });
			}
		}
		if (type === 'folder') {
			const filesCollection = dbClient.db.collection('files');
			const newFolder = {
				userId: user._id,
				name,
				type,
				parentId: parentId || 0,
				isPublic: isPublic || false
			};
			await filesCollection.insertOne(newFolder);
			newFolder.id = newFolder._id;
			return res.status(201).json({
				id: newFolder.id,
				userId: user._id,
				name,
				type,
				parentId: parentId || 0,
				isPublic: isPublic || false
			});
		}
		// File creation
		const uuid = uuidv4();
		const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';
		const filePath = `${folderPath}/${uuid}`;
		if (!fs.existsSync(folderPath)) {
			fs.mkdirSync(folderPath, { recursive: true }, (err) => {
				if (err) {
					console.error('A problem occured when creating the directory', err);
					res.status(500).end();
				}
			});
		}
		const decryptedData = Buffer.from(data, 'base64');
		fs.writeFile(filePath, decryptedData, (err) => {
			if (err) {
				console.error('A problem occured when creating the file', err);
				res.status(500).end();
			}
		});
		// File to database
		const newFile = {
			userId: user._id,
			name,
			type,
			isPublic: isPublic || false,
			parentId: parentId || 0,
			localPath: filePath,
		};
		const filesCollection = dbClient.db.collection('files');
		await filesCollection.insertOne(newFile);
		newFile.id = newFile._id;
		// Add image to the Bull queue
		const queue = new Queue('fileQueue');
		if (newFile.type === 'image') {
			await queue.add({ userId: newFile.userId, fileId: newFile.id });
		}
		return res.status(201).json({
			id: newFile.id,
			userId,
			name,
			type,
			isPublic: isPublic || false,
			parentId: parentId || 0,
		});
	}
};
export default FilesController;
