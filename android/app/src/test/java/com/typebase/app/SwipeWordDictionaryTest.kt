package com.typebase.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class SwipeWordDictionaryTest {
  @Test
  fun parsePoints_capsAt512() {
    val points = buildString {
      append('[')
      repeat(600) { index ->
        if (index > 0) append(',')
        append("""{"x":$index,"y":$index}""")
      }
      append(']')
    }
    assertEquals(512, SwipeWordDictionary.testingParsePointsCount(points))
  }

  @Test
  fun parseTimedPoints_capsAt900() {
    val points = buildString {
      append('[')
      repeat(950) { index ->
        if (index > 0) append(',')
        append("""{"x":1,"y":2,"t":$index}""")
      }
      append(']')
    }
    assertEquals(900, SwipeWordDictionary.testingParseTimedPointsCount(points))
  }

  @Test
  fun extractPauseAnchors_detectsStableDwell() {
    val keysJson =
        """[
          {"letter":"h","x":0,"y":0,"width":48,"height":48,"centerX":24,"centerY":24},
          {"letter":"e","x":60,"y":0,"width":48,"height":48,"centerX":84,"centerY":24},
          {"letter":"l","x":120,"y":0,"width":48,"height":48,"centerX":144,"centerY":24}
        ]"""
    val timedJson =
        """[
          {"x":24,"y":24,"t":0},
          {"x":25,"y":25,"t":40},
          {"x":26,"y":26,"t":80},
          {"x":84,"y":24,"t":120},
          {"x":85,"y":25,"t":220},
          {"x":86,"y":26,"t":320},
          {"x":144,"y":24,"t":360}
        ]"""
    val anchors =
        SwipeWordDictionary.testingExtractPauseAnchorsJson(timedJson, keysJson)
    assertTrue(anchors.isNotEmpty())
    assertEquals('h', anchors.first())
    assertTrue(anchors.length >= 2)
  }
}
