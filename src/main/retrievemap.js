import OpenAI from "openai"
import { eq } from 'drizzle-orm'
import { searchCache, allocationCache, contentCache } from './db/index.js'

const apiKey = import.meta.env.MAIN_VITE_OPENROUTER_API_KEY;

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: apiKey,
  defaultHeaders: {
    "HTTP-Referer": "http://localhost:3000", 
    "X-Title": "Skill Roadmap App",         
  }
})

async function callAI(prompt) {
  try {
    const response = await openai.chat.completions.create({
      model: "google/gemini-2.0-flash", 
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_tokens: 2000, // Reduced to prevent balance reservation errors (402)
    });
    return JSON.parse(response.choices[0].message.content);
  } catch (err) {
    if (err.status === 429) {
      throw new Error("AI is busy (Rate Limited). Please wait 10 seconds.");
    }
    throw err;
  }
}

const searchOpenRouter = async (db, skill, level_description, end_goal) => {
  const cached = await db.select().from(searchCache).where(eq(searchCache.skill, skill)).get()
  if (cached) return JSON.parse(cached.response)

  const prompt = `Identify 3 difficulty tiers for learning ${skill}. 
    User current level: ${level_description}. Goal: ${end_goal}.
    Return JSON: { "ranking": ["Tier 1", "Tier 2", "Tier 3"] }`;

  const target = await callAI(prompt);

  // FIX: UPSERT logic for searchCache
  await db.insert(searchCache).values({
    skill,
    response: JSON.stringify(target),
    createdAt: new Date()
  }).onConflictDoUpdate({
    target: searchCache.skill,
    set: { response: JSON.stringify(target), createdAt: new Date() }
  });

  return target
}

const allocationSkillAgent = async (db, topic, tiers) => {
  const cacheKey = `${topic}:${JSON.stringify(tiers)}`
  const cached = await db.select().from(allocationCache).where(eq(allocationCache.cacheKey, cacheKey)).get()
  if (cached) return JSON.parse(cached.response)

  const prompt = `For ${topic}, map exactly 2-3 specific skills to each of these tiers: ${tiers.join(', ')}. 
    Return JSON: { "roadmap": { "${tiers[0]}": ["skill A", "skill B"], ... } }`;

  const response = await callAI(prompt);
  const target = response.roadmap;
  const result = { roadmap: target, node_skills: [...new Set(Object.values(target).flat())] }
  
  // FIX: UPSERT logic for allocationCache
  await db.insert(allocationCache).values({
    cacheKey,
    response: JSON.stringify(result),
    createdAt: new Date()
  }).onConflictDoUpdate({
    target: allocationCache.cacheKey,
    set: { response: JSON.stringify(result), createdAt: new Date() }
  });

  return result
}

const contentSkill = async (db, topic, skills) => {
  const cacheKey = `${topic}:${JSON.stringify(skills)}`
  const cached = await db.select().from(contentCache).where(eq(contentCache.cacheKey, cacheKey)).get()
  if (cached) return JSON.parse(cached.response)

  // Optimization: Tell the AI to keep descriptions brief to save tokens
  const prompt = `For these ${topic} skills: ${skills.join(', ')}, provide details.
    Keep descriptions under 2 sentences.
    Return JSON: { "Skill Name": { "description": "...", "tips": ["tip1"], "url": "youtube_link" } }`;

  const target = await callAI(prompt);

  // FIX: UPSERT logic for contentCache
  await db.insert(contentCache).values({
    cacheKey,
    response: JSON.stringify(target),
    createdAt: new Date()
  }).onConflictDoUpdate({
    target: contentCache.cacheKey,
    set: { response: JSON.stringify(target), createdAt: new Date() }
  });

  return target
}

export const generateRoadmap = async (db, topic, level_description, end_goal) => {
  try {
    if (!apiKey) throw new Error("API Key missing");

    const response = await searchOpenRouter(db, topic, level_description, end_goal)
    const { roadmap, node_skills } = await allocationSkillAgent(db, topic, response.ranking)
    const contentResponse = await contentSkill(db, topic, node_skills)

    const startNodes = []
    const skillNodes = []
    const tiers = Object.keys(roadmap)

    tiers.forEach((tierName, i) => {
      startNodes.push({ id: `start-${i}`, levelIndex: i, name: tierName })
      roadmap[tierName].forEach((skillName, j) => {
        const details = contentResponse[skillName] || {}
        skillNodes.push({
          id: `level-${i}-skill-${j}`,
          levelIndex: i,
          name: skillName,
          description: details.description || "",
          tips: details.tips || [],
          youtubeUrl: details.url || null
        })
      })
    })

    return { startNodes, skillNodes }
    
  } catch (error) {
    console.error("Roadmap Pipeline Failed:", error.message)
    throw error
  }
}