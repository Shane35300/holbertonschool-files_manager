import { ObjectId } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import Bull from 'bull';
import mime from 'mime-types';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

const fileQueue = new Bull('fileQueue');

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
    const {
      name, type, parentId, isPublic, data,
    } = req.body;
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
        isPublic: isPublic || false,
      };
      await filesCollection.insertOne(newFolder);
      newFolder.id = newFolder._id;
      return res.status(201).json({
        id: newFolder.id,
        userId: user._id,
        name,
        type,
        parentId: parentId || 0,
        isPublic: isPublic || false,
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
    if (newFile.type === 'image') {
      fileQueue.add({ userId: newFile.userId.toString(), fileId: newFile.id.toString() });
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

  static async getShow(req, res) {
    const token = req.headers['x-token'];
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const fileId = req.params.id;
    const filesCollection = dbClient.db.collection('files');
    const file = await filesCollection.findOne({
      _id: new ObjectId(fileId),
      userId: new ObjectId(userId),
    });

    if (!file) {
      return res.status(404).json({ error: 'Not found' });
    }

    return res.status(200).json(file);
  }

  static async getIndex(req, res) {
    const token = req.headers['x-token'];
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { parentId = '0', page = 0 } = req.query;
    const userIdToFind = new ObjectId(userId);
    const skip = parseInt(page, 10) * 20;
    let match = {
      userId: userIdToFind,
    };
    if (parentId !== '0') {
      match = {
        userId: userIdToFind,
        parentId,
      };
    }
    const filesCollection = dbClient.db.collection('files');
    const cursor = filesCollection.aggregate([
      { $match: match },
      { $skip: skip },
      { $limit: 20 },
    ]);
    const allFiles = await cursor.toArray();
    const jsonResponse = allFiles.map((file) => ({
      id: file._id,
      userId: file.userId,
      name: file.name,
      type: file.type,
      isPublic: file.isPublic,
      parentId: file.parentId,
    }));
    return res.status(200).json(jsonResponse);
  }

  static async putPublish(req, res) {
    const token = req.headers['x-token'];
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const fileId = req.params.id;
    const filesCollection = dbClient.db.collection('files');
    const file = await filesCollection.findOne({
      _id: new ObjectId(fileId),
      userId: new ObjectId(userId),
    });

    if (!file) {
      return res.status(404).json({ error: 'Not found' });
    }

    await filesCollection.updateOne({ _id: new ObjectId(fileId) }, { $set: { isPublic: true } });
    const updatedFile = await filesCollection.findOne({ _id: new ObjectId(fileId) });

    return res.status(200).json({
      id: updatedFile._id,
      userId: updatedFile.userId,
      name: updatedFile.name,
      type: updatedFile.type,
      isPublic: updatedFile.isPublic,
      parentId: updatedFile.parentId,
    });
  }

  static async putUnpublish(req, res) {
    const token = req.headers['x-token'];
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const fileId = req.params.id;
    const filesCollection = dbClient.db.collection('files');
    const file = await filesCollection.findOne({
      _id: new ObjectId(fileId),
      userId: new ObjectId(userId),
    });

    if (!file) {
      return res.status(404).json({ error: 'Not found' });
    }

    await filesCollection.updateOne({ _id: new ObjectId(fileId) }, { $set: { isPublic: false } });
    const updatedFile = await filesCollection.findOne({ _id: new ObjectId(fileId) });

    return res.status(200).json({
      id: updatedFile._id,
      userId: updatedFile.userId,
      name: updatedFile.name,
      type: updatedFile.type,
      isPublic: updatedFile.isPublic,
      parentId: updatedFile.parentId,
    });
  }

  static async getFile(req, res) {
    const token = req.headers['x-token'] || null;
    const fileId = req.params.id;
    const { size } = req.query;
    try {
      const filesCollection = dbClient.db.collection('files');
      const file = await filesCollection.findOne({ _id: new ObjectId(fileId) });

      if (!file) {
        return res.status(404).json({ error: 'Not found' });
      }

      if (!file.isPublic) {
        if (!token) {
          return res.status(404).json({ error: 'Not found' });
        }
        const userId = await redisClient.get(`auth_${token}`);
        if (!userId || file.userId.toString() !== userId.toString()) {
          return res.status(404).json({ error: 'Not found' });
        }
      }

      if (file.type === 'folder') {
        return res.status(400).json({ error: "A folder doesn't have content" });
      }

      let filePath = file.localPath;
      if (size && ['100', '250', '500'].includes(size)) {
        filePath = `${filePath}_${size}`;
      }

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Not found' });
      }

      const mimeType = mime.lookup(file.name) || 'application/octet-stream';
      res.setHeader('Content-Type', mimeType);

      const fileContent = fs.readFileSync(filePath);
      return res.status(200).send(fileContent);
    } catch (error) {
      console.error('Error while fetching the file:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }
}
export default FilesController;
