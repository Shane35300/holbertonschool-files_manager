import { MongoClient } from 'mongodb';

// Retrieve environment variables or use default values
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = process.env.DB_PORT || 27017;
const DB_DATABASE = process.env.DB_DATABASE || 'files_manager';
const url = `mongodb://${DB_HOST}:${DB_PORT}`;
const dbName = DB_DATABASE;

class DBClient {
  constructor() {
    this.client = new MongoClient(url, { useNewUrlParser: true, useUnifiedTopology: true });
    this.connected = false;

    this.client.connect((err) => {
      if (err) {
        console.error('MongoDB client not connected to the server:', err);
      } else {
        this.connected = true;
        this.db = this.client.db(dbName);
      }
    });
  }

  isAlive() {
    return this.connected;
  }

  async nbUsers() {
    try {
      if (!this.connected) return 0;
      return await this.db.collection('users').countDocuments();
    } catch (error) {
      console.error('Error fetching number of users:', error);
      return 0;
    }
  }

  async nbFiles() {
    try {
      if (!this.connected) return 0;
      return await this.db.collection('files').countDocuments();
    } catch (error) {
      console.error('Error fetching number of files:', error);
      return 0;
    }
  }
}

// Create and export an instance of DBClient
const dbClient = new DBClient();
export default dbClient;
