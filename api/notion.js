import { Client } from "@notionhq/client";

const notion = new Client({
  auth: process.env.NOTION_TOKEN,
});

const dbMap = {
  news: process.env.NOTION_NEWS_DB,
  results: process.env.NOTION_RESULTS_DB,
  orgs: process.env.NOTION_ORGS_DB,
};

function richTextToPlain(richText = []) {
  return richText.map(t => t.plain_text || "").join("");
}

function getTitle(page, names = []) {
  for (const name of names) {
    const value = page.properties?.[name];
    if (value?.type === "title") {
      return richTextToPlain(value.title);
    }
  }
  return "";
}

function getRichText(page, names = []) {
  for (const name of names) {
    const value = page.properties?.[name];
    if (value?.type === "rich_text") {
      return richTextToPlain(value.rich_text);
    }
  }
  return "";
}

function getDate(page, names = []) {
  for (const name of names) {
    const value = page.properties?.[name];
    if (value?.type === "date") {
      return value.date?.start || "";
    }
  }
  return "";
}

function getSelect(page, names = []) {
  for (const name of names) {
    const value = page.properties?.[name];
    if (value?.type === "select") {
      return value.select?.name || "";
    }
  }
  return "";
}

function getNumber(page, names = []) {
  for (const name of names) {
    const value = page.properties?.[name];
    if (value?.type === "number") {
      return value.number ?? "";
    }
  }
  return "";
}

function getUrl(page, names = []) {
  for (const name of names) {
    const value = page.properties?.[name];
    if (value?.type === "url") {
      return value.url || "";
    }
  }
  return "";
}

function getFiles(page, names = []) {
  for (const name of names) {
    const value = page.properties?.[name];
    if (value?.type === "files" && Array.isArray(value.files) && value.files.length > 0) {
      const first = value.files[0];
      if (first.type === "external") return first.external?.url || "";
      if (first.type === "file") return first.file?.url || "";
    }
  }
  return "";
}

function getCheckbox(page, names = []) {
  for (const name of names) {
    const value = page.properties?.[name];
    if (value?.type === "checkbox") {
      return value.checkbox;
    }
  }
  return undefined;
}

async function getAllBlocks(blockId) {
  let results = [];
  let cursor = undefined;
  let hasMore = true;

  while (hasMore) {
    const response = await notion.blocks.children.list({
      block_id: blockId,
      start_cursor: cursor,
      page_size: 100,
    });

    results = results.concat(response.results);
    hasMore = response.has_more;
    cursor = response.next_cursor || undefined;
  }

  return results;
}

function blockText(block) {
  const type = block.type;
  const value = block[type];
  if (!value) return "";

  if (Array.isArray(value.rich_text)) {
    return richTextToPlain(value.rich_text);
  }

  if (type === "child_page") return value.title || "";
  if (type === "bookmark") return value.url || "";
  if (type === "embed") return value.url || "";

  if (type === "image") {
    if (value.type === "external") return value.external?.url || "";
    if (value.type === "file") return value.file?.url || "";
  }

  return "";
}

async function serializeBlocks(blockId) {
  const blocks = await getAllBlocks(blockId);
  const serialized = [];

  for (const block of blocks) {
    const item = {
      id: block.id,
      type: block.type,
      text: blockText(block),
      has_children: block.has_children,
      children: [],
    };

    if (block.type === "image") {
      const value = block.image;
      item.image =
        value?.type === "external"
          ? value.external?.url || ""
          : value?.type === "file"
          ? value.file?.url || ""
          : "";
      item.caption = richTextToPlain(value?.caption || []);
    }

    if (block.type === "bookmark") {
      item.url = block.bookmark?.url || "";
    }

    if (block.type === "embed") {
      item.url = block.embed?.url || "";
    }

    if (block.type === "code") {
      item.language = block.code?.language || "";
    }

    if (block.type === "to_do") {
      item.checked = block.to_do?.checked || false;
    }

    if (block.has_children) {
      item.children = await serializeBlocks(block.id);
    }

    serialized.push(item);
  }

  return serialized;
}

function normalizePage(page, type) {
  const common = {
    id: page.id,
    created_time: page.created_time,
    last_edited_time: page.last_edited_time,
    properties: page.properties,
    cover:
      page.cover?.type === "external"
        ? page.cover.external?.url || ""
        : page.cover?.type === "file"
        ? page.cover.file?.url || ""
        : "",
  };

  if (type === "news") {
    return {
      ...common,
      title: getTitle(page, ["제목", "이름", "Title", "Name"]),
      date: getDate(page, ["날짜", "일자", "Date"]),
      source: getRichText(page, ["출처", "언론사", "매체", "Source"]),
      summary: getRichText(page, ["요약", "설명", "Summary", "내용"]),
      link: getUrl(page, ["링크", "URL", "주소", "기사링크"]),
      thumbnail: getFiles(page, ["썸네일", "대표이미지", "이미지", "사진"]) || common.cover,
      isPublished: getCheckbox(page, ["공개", "게시", "Published"]),
    };
  }

  if (type === "results") {
    return {
      ...common,
      title: getTitle(page, ["사업명", "제목", "이름", "Title", "Name"]),
      category: getSelect(page, ["분류", "카테고리", "Category"]),
      year: getNumber(page, ["연도", "Year"]),
      period: getRichText(page, ["기간", "진행기간"]),
      summary: getRichText(page, ["내용", "설명", "요약", "Summary"]),
      thumbnail: getFiles(page, ["썸네일", "대표이미지", "이미지", "사진"]) || common.cover,
      isPublished: getCheckbox(page, ["공개", "게시", "Published"]),
    };
  }

  if (type === "orgs") {
    return {
      ...common,
      title: getTitle(page, ["기관명", "조직명", "이름", "Title", "Name"]),
      category: getSelect(page, ["분류", "유형", "카테고리"]),
      summary: getRichText(page, ["소개", "설명", "요약"]),
      thumbnail: getFiles(page, ["썸네일", "대표이미지", "이미지", "사진"]) || common.cover,
      isPublished: getCheckbox(page, ["공개", "게시", "Published"]),
    };
  }

  return common;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { type = "news", pageId } = req.query;

    if (!process.env.NOTION_TOKEN) {
      return res.status(500).json({ error: "NOTION_TOKEN missing" });
    }

    if (pageId) {
      const page = await notion.pages.retrieve({ page_id: pageId });
      const blocks = await serializeBlocks(pageId);

      return res.status(200).json({
        page: {
          id: page.id,
          properties: page.properties,
          cover:
            page.cover?.type === "external"
              ? page.cover.external?.url || ""
              : page.cover?.type === "file"
              ? page.cover.file?.url || ""
              : "",
        },
        blocks,
      });
    }

    const databaseId = dbMap[type];
    if (!databaseId) {
      return res.status(400).json({ error: "Invalid type parameter" });
    }

    const response = await notion.databases.query({
      database_id: databaseId,
      page_size: 100,
    });

    let results = response.results.map(page => normalizePage(page, type));

    results = results.filter(item => item.isPublished !== false);

    return res.status(200).json({
      type,
      count: results.length,
      results,
    });
  } catch (error) {
    console.error("Notion API error:", error);

    return res.status(500).json({
      error: "Failed to fetch data from Notion",
      detail: error.message || "Unknown error",
    });
  }
}
