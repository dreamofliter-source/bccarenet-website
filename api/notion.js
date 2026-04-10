export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { type } = req.query;
  const token = process.env.NOTION_TOKEN;
  const dbMap = {
    news: process.env.NOTION_NEWS_DB,
    results: process.env.NOTION_RESULTS_DB,
    orgs: process.env.NOTION_ORGS_DB,
  };
  const dbId = dbMap[type];
  if (!dbId || !token) {
    return res.status(400).json({ error: 'Missing config', hasToken: !!token });
  }
  try {
    const response = await fetch(
      `https://api.notion.com/v1/databases/${dbId}/query`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sorts: [{ timestamp: 'created_time', direction: 'descending' }],
        }),
      }
    );
    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
